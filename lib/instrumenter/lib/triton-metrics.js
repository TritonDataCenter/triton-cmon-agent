/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2019, Joyent, Inc.
 */

'use strict';
var mod_assert = require('assert-plus');
var mod_jsprim = require('jsprim');
var mod_netconfig = require('triton-netconfig');
var mod_restify = require('restify');
var mod_vasync = require('vasync');
var mod_verror = require('verror');
var mod_vmadm = require('vmadm');

// Ensure that deleted VMs are eventually removed from the cache
var CACHE_TTL = 3600;

/*
 * getVmInfo has one argument of note, opts.coreZoneConfirmed, that
 * changes the way the `isCoreZone` field of the `info` return object is set.
 *
 * If coreZoneConfirmed is `true`, we interpret this as meaning that this
 * function has been called from a context where we already know that the zone
 * is a core zone, so we just set isCoreZone to `true` in the returned object.
 *
 * If coreZoneConfirmed is `false`, we don't yet know if the zone is a core
 * zone, so we determine this manually by checking if the zone is owned by the
 * admin user and has a smartdc_role tag.
 *
 * Note that this manual check does not detect core Manta zones - see the
 * comment for the getTritonMetadata function below, and the comment for the
 * getCoreZoneStatus function in lib/endpoints/metrics.js, for some context.
 */
function getVmInfo(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.uuid(opts.vmUuid, 'opts.vmUuid');
    mod_assert.func(callback, 'callback');
    mod_assert.bool(opts.coreZoneConfirmed, 'opts.coreZoneConfirmed');
    if (!opts.coreZoneConfirmed) {
        mod_assert.uuid(opts.adminUuid, 'opts.adminUuid');
    }

    var info = {};

    var vmadmOpts = {
        uuid: opts.vmUuid,
        log: opts.log,
        fields: ['customer_metadata', 'nics', 'owner_uuid', 'tags']
    };

    mod_vmadm.load(vmadmOpts, function gotVm(err, vm) {
        if (err) {
            callback(err);
            return;
        }

        if (opts.coreZoneConfirmed) {
            info.isCoreZone = true;
        } else {
            var hasSmartDcRole = vm.tags && vm.tags.smartdc_role;
            var ownerIsAdmin = opts.adminUuid === vm.owner_uuid;
            info.isCoreZone = hasSmartDcRole && ownerIsAdmin;
        }

        if (!info.isCoreZone) {
            callback(null, info);
            return;
        }

        // We assume that the metrics server is exposed
        // on the admin nic
        info.adminIp = mod_netconfig.adminIpFromVmMetadata(vm);

        var customerMetadata = vm.customer_metadata;
        info.metricPorts = customerMetadata.metricPorts;
        callback(null, info);
    });
}

/*
 * This function is called from two contexts:
 *
 * If cmon-agent receives a request from cmon versions < 1.6.0, we call
 * getTritonMetadata to determine whether the zone is a core Triton zone. In
 * this case, opts.coreZoneConfirmed is set to `false` and passed through to
 * getVmInfo - see the comment above.
 *
 * This function is also called from getTritonMetrics below. In this case,
 * opts.coreZoneConfirmed is set to `true`, because getTritonMetrics is only
 * called from a context where we already know that the zone is a core Triton or
 * Manta zone.
 *
 * See the comment for the getCoreZoneStatus function in
 * lib/endpoints/metrics.js for some context.
 */
function getTritonMetadata(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.cache, 'opts.cache');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.uuid(opts.vmUuid, 'opts.vmUuid');
    mod_assert.func(callback, 'callback');
    mod_assert.bool(opts.coreZoneConfirmed,
        'opts.coreZoneConfirmed');
    if (!opts.coreZoneConfirmed) {
        mod_assert.uuid(opts.adminUuid, 'opts.adminUuid');
    }

    var cache = opts.cache;
    var cacheKey = 'triton-metrics/' + opts.vmUuid;

    cache.get(cacheKey,
    function gotCache(cacheErr, vm) {
        // err or cache miss
        if (cacheErr) {
            getVmInfo(opts, function gotVmInfo(err, data) {
                if (err) {
                    callback(err);
                    return;
                }

                cache.insert(cacheKey, data, CACHE_TTL);
                callback(null, data);
            });
        } else {
            callback(null, vm);
        }
    });
}

/*
 * This function is run from the TritonCoreCollector, which only runs if the
 * target zone has been identified as a core zone. Thus, this function
 * propagates this piece of information to the functions it calls.
 *
 * See the comment for the getCoreZoneStatus function in
 * lib/endpoints/metrics.js for some context.
 */
function getTritonMetrics(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.cache, 'opts.cache');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.uuid(opts.vmUuid, 'opts.vmUuid');
    mod_assert.func(callback, 'callback');

    // If we're here, we already know that the zone is a core zone.
    opts.coreZoneConfirmed = true;
    getTritonMetadata(opts, function gotMetadata(err, metadata) {
        if (err) {
            callback(err);
            return;
        }

        if (metadata.adminIp && metadata.metricPorts) {
            var adminIp = metadata.adminIp;

            // metricPorts must be comma separated without spaces
            // Ex. 8881,8882,8883,8884
            var metricPorts = metadata.metricPorts.split(',');
            for (var i = 0; i < metricPorts.length; i++) {
                var parsedPort = mod_jsprim.parseInteger(metricPorts[i]);
                if (parsedPort instanceof Error) {
                    callback(new Error('Invalid metric ports: ' +
                        JSON.stringify(metricPorts)));
                    return;
                }
            }

            mod_vasync.forEachParallel({
                func: function getMetrics(port, done) {
                    /*
                     * In order to avoid latency if a metricPort is closed, we
                     * do not retry requests.
                     */
                    var client = mod_restify.createStringClient({
                        url: 'http://' + adminIp + ':' + port,
                        retry: false
                    });

                    client.get('/metrics',
                    function gotMetrics(_err, req, res, data) {
                        if (_err) {
                            var msg = 'Triton metrics http request failed';
                            var newErr = new mod_verror({
                                cause: _err,
                                name: 'NotAvailableError'
                            }, msg);

                            done(newErr);
                            return;
                        }

                        done(null, data);
                    });
                },
                inputs: metricPorts
            }, function gotAllMetrics(_err, results) {
                if (_err) {
                    callback(_err);
                    return;
                }

                callback(null, results.successes);
            });
        } else {
            callback(null, []);
        }
    });
}

module.exports = {
    getTritonMetrics: getTritonMetrics,
    getTritonMetadata: getTritonMetadata
};
