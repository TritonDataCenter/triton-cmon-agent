/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2017 Joyent, Inc.
 */
'use strict';

var mod_assert = require('assert-plus');
var mod_vasync = require('vasync');

var forkExecWait = require('forkexec').forkExecWait;

var FSCALE = 256; /* derived from sys/param.h */

/*
 * Takes an integer and calculates load average by dividing by FSCALE. If the
 * value provided is not divisible by FSCALE the return value will not be an
 * integer.
 *
 * FSCALE is defined in illumos-joyent sys/param.h as (1<<FSHIFT) and FSHIFT is
 * similarly defined in illumos-joyent sys/param.h as 8. It is defined as the
 * scale factor for scaled integers used to count %cpu time and load averages.
 */
function calculateLoadAvg(value) {
    mod_assert.ok(Number.isSafeInteger(value), 'value must be a safe integer');

    return value / FSCALE;
}

/*
 * Takes an integer and checks that the value is a valid memory value. If the
 * value provided is 0 or 2^64 this function will return undefined. Otherwise
 * this function will pass back the value unmodified.
 *
 * This function is derived from sdc-cloud-analytics cmd/cainst/modules/kstat.js
 */
function memLimit(value) {
    mod_assert.ok(Number.isInteger(value), 'value must be an integer');

    if (value === Math.pow(2, 64) || value === 0) {
        return undefined;
    }

    return value;
}

/*
 * Get list of all running zones and creates an array of objects. Each object in
 * the array has a uuid property and a zoneid property. This results in a
 * mapping of vm_uuid to zoneid for use in gathering kstats given a vm_uuid.
 * Generally a kstat reader requires a zoneid not a vm_uuid.
 *
 * Partially derived from sdc-amon listAllZones.
 */
function fetchRunningZones(cb) {
    mod_assert.func(cb, 'cb');

    var zones = [];
    forkExecWait({
        'argv': ['/usr/sbin/zoneadm', 'list', '-p']
    }, function _processOutput(err, data) {
        if (err) {
            cb(err);
            return;
        }

        var lines = data.stdout.trim().split('\n');
        mod_vasync.forEachPipeline({
            'inputs': lines,
            'func': function _mapLine(line, next) {
                var vals = line.split(':');
                var zoneid = parseInt(vals[0], 10); /* zoneid/instance int */
                mod_assert.number(zoneid, 'zoneid');

                var uuid = vals[4]; /* uuid is the 5th col in the output */

                /* skip the GZ */
                if (zoneid > 0) {
                    zones.push({ uuid: uuid, zoneid: zoneid });
                }

                next();
            }
        }, function _fetchRunningZonesHandleFep(fepErr) {
            cb(fepErr, zones);
            return;
        });
    });
}

module.exports = {
    calculateLoadAvg: calculateLoadAvg,
    memLimit: memLimit,
    fetchRunningZones: fetchRunningZones
};
