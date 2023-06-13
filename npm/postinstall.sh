#!/bin/bash
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright 2018 Joyent, Inc.
# Copyright 2023 MNX Cloud, Inc.
#

if [[ "${SDC_AGENT_SKIP_LIFECYCLE:-no}" = "yes" ]]; then
    printf 'Running during package build; skipping lifecycle script.\n' >&2
    exit 0
fi

if [[ $(uname -s) != "SunOS" ]]; then
    echo "error: this postinstall is only supported on SunOS"
    exit 0
fi

#
# We must load the SDC configuration before setting any strict error handling
# options.
#
. /lib/sdc/config.sh
load_sdc_config

ROOT="$(cd `dirname $0`/../ 2>/dev/null && pwd)"

. "${ROOT}/npm/lib/error_handler.sh"
. "${ROOT}/npm/lib/trace_logger.sh"

set -o nounset

export PREFIX="$npm_config_prefix"
export ETC_DIR="$npm_config_etc"
export SMF_DIR="$npm_config_smfdir"
export VERSION="$npm_package_version"
export ENABLED="true"

AGENT="$npm_package_name"

BOOTPARAMS=/usr/bin/bootparams
AWK=/usr/bin/awk


# ---- support functions

#
# Replace various substitution tokens in the input file, and write the result
# into the output file.
#
function subfile
{
    local infile="$1"
    local outfile="$2"

    if [[ -z "${infile}" || -z "${outfile}" ]]; then
        fatal 'subfile requires two arguments'
    fi

    if ! sed -e "s#@@PREFIX@@#$PREFIX#g" \
      -e "s/@@VERSION@@/$VERSION/g" \
      -e "s#@@ROOT@@#$ROOT#g" \
      -e "s/@@ENABLED@@/$ENABLED/g" \
      "${infile}" > "${outfile}"; then
        fatal 'sed failure ("%s" -> "%s")' "${infile}" "${outfile}"
    fi
}

#
# Replace substitution tokens in the SMF manifest files, and then import the SMF
# services.
#
function import_smf_manifest
{
    local agent_manifest_in="$ROOT/smf/manifests/$AGENT.xml.in"
    local agent_manifest_out="$SMF_DIR/$AGENT.xml"
    local agent_setup_manifest_in="$ROOT/smf/manifests/${AGENT}-setup.xml.in"
    local agent_setup_manifest_out="$SMF_DIR/${AGENT}-setup.xml"

    if [[ ! -f "${agent_manifest_in}" ]]; then
        fatal 'could not find smf manifest input file: %s' \
            "${agent_manifest_in}"
    fi

    if [[ ! -f "${agent_setup_manifest_in}" ]]; then
        fatal 'could not find smf manifest input file: %s'
        "${agent_setup_manifest_in}"
    fi

    if ! subfile "${agent_manifest_in}" "${agent_manifest_out}" ||
      ! svccfg import "${agent_manifest_out}"; then
        fatal 'could not process smf manifest (%s)' "${agent_manifest_in}"
    fi

    if ! subfile "${agent_setup_manifest_in}" "${agent_setup_manifest_out}" ||
      ! svccfg import "${agent_setup_manifest_out}"; then
        fatal 'could not process smf manifest (%s)' "${agent_setup_manifest_in}"
    fi
}

#
# Each installation of an agent is represented by a SAPI instance of the SAPI
# service for that agent.  These UUIDs are persistent, so that upgrades do not
# induce the generation of a new UUID.  If a UUID has not yet been written to
# disk, we generate one now.  Otherwise, the existing UUID is read and
# returned.
#
function get_or_create_instance_uuid
{
    local uuid_file="${ETC_DIR}/${AGENT}"
    local uuid

    if [[ -z "${ETC_DIR}" || -z "${AGENT}" ]]; then
        fatal 'ETC_DIR and AGENT must be set'
    fi

    if [[ ! -f "${uuid_file}" ]]; then
        #
        # The instance UUID file does not exist.  Create one.
        #
        printf 'New agent instance.  Generating new UUID.\n' >&2
        if ! /usr/bin/uuid -v4 >"${uuid_file}"; then
            fatal 'could not write new UUID to "%s"' "${uuid_file}"
        fi
    fi

    if ! uuid="$(<${uuid_file})" || [[ -z "${uuid}" ]]; then
            fatal 'could not read UUID from "%s"' "${uuid_file}"
    fi

    printf 'Agent UUID: %s\n' "${uuid}" >&2
    printf '%s' "${uuid}"
    return 0
}

function adopt_instance
{
    local instance_uuid=$1
    local service_uuid
    local retry=10
    local url
    local data

    if [[ -z "${instance_uuid}" ]]; then
        fatal 'must pass instance_uuid'
    fi

    while (( retry-- > 0 )); do
        #
        # Fetch the UUID of the SAPI service for this agent.
        #
        url="${SAPI_URL}/services?type=agent&name=${AGENT}"
        if ! service_uuid="$(curl -sSf -H 'Accept: application/json' "${url}" \
          | json -Ha uuid)"; then
            printf 'Could not retrieve SAPI service UUID for "%s"\n' \
              "${AGENT}" >&2
            sleep 5
            continue
        fi

        #
        # Attempt to register the SAPI instance for this agent installation.
        # We need not be overly clever here; SAPI returns success for a
        # duplicate agent adoption.
        #
        url="${SAPI_URL}/instances"
        data="{
            \"service_uuid\": \"${service_uuid}\",
            \"uuid\": \"${instance_uuid}\"
        }"
        if ! curl -sSf -X POST -H 'Content-Type: application/json' \
          -d "${data}" "${url}"; then
            printf 'Could not register SAPI instance with UUID "%s"\n' \
              "${instance_uuid}" >&2
            sleep 5
            continue
        fi

        printf 'Agent successfully adopted into SAPI.\n' >&2
        return 0
    done

    fatal 'adopt_instance: failing after too many retries'
}

#
# Check if we expect SAPI to be available.  Generally, registering with SAPI is
# a hard requirement for the correct functioning of the system, but this
# postinstall script can also be run during headnode setup; SAPI is not yet
# available at that point.
#
function sapi_should_be_available
{
    local headnode
    local script
    local setup_complete

    #
    # In the event that SAPI is unavailable, we allow the operator to force us
    # not to register with SAPI.  This behaviour should NOT be exercised
    # programatically; it exists purely to allow operators to attempt
    # (manually) to correct in the face of an abject failure of the system.
    #
    if [[ "${NO_SAPI:-false}" = true ]]; then
        printf 'NO_SAPI=true in environment.\n' >&2
        return 1
    fi

    script='
        $1 == "headnode" {
            print $2;
            exit 0;
        }
    '
    if ! headnode=$(${BOOTPARAMS} | ${AWK} -F= "${script}"); then
        fatal 'could not read bootparams'
    fi

    if [[ "${headnode}" != 'true' ]]; then
        #
        # This is a compute node.  SAPI is expected to be available, and
        # registration is expected to work.
        #
        printf 'This is not the headnode.\n' >&2
        return 0
    fi

    #
    # This is the headnode.  If setup has not yet been completed, then SAPI
    # is not yet available.
    #
    if [[ ! -f '/var/lib/setup.json' ]]; then
        fatal 'could not find setup state file: "/var/lib/setup.json"'
    fi
    if ! setup_complete=$(json -f '/var/lib/setup.json' 'complete'); then
        fatal 'could not read "complete" from "/var/lib/setup.json"'
    fi

    if [[ "${setup_complete}" = true ]]; then
        #
        # Setup is complete.  SAPI is available.  Registration is expected
        # to work.
        #
        printf 'This is the headnode, and setup is already complete.\n' >&2
        return 0
    fi

    #
    # Setup is not yet complete.  The headnode setup process will register
    # this SAPI instance at the appropriate time.
    #
    printf 'This is the headnode, but setup is not yet complete.\n' >&2
    return 1
}


# ---- mainline

if [[ -z "${CONFIG_sapi_domain}" ]]; then
    fatal '"sapi_domain" was not found in "node.config".'
fi
SAPI_URL="http://${CONFIG_sapi_domain}"

import_smf_manifest

INSTANCE_UUID="$(get_or_create_instance_uuid)"

if sapi_should_be_available; then
    printf 'SAPI expected to be available.  Adopting agent instance.\n' >&2
    adopt_instance "${INSTANCE_UUID}"
else
    printf 'SAPI not yet available.  Skipping agent registration.\n' >&2
fi

exit 0
