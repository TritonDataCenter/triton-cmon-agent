/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

'use strict';
var mod_assert = require('assert-plus');
var mod_jsprim = require('jsprim');
var mod_restify = require('restify');
var mod_vasync = require('vasync');
var mod_verror = require('verror');
var mod_vmadm = require('vmadm');

// Ensure that deleted VMs are eventually removed from the cache
var CACHE_TTL = 3600;

function getVmInfo(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.adminUuid, 'opts.adminUuid');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.uuid(opts.vmUuid, 'opts.vmUuid');
    mod_assert.func(callback, 'callback');

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

        var hasSmartDcRole = vm.tags && vm.tags.smartdc_role;
        var ownerIsAdmin = opts.adminUuid === vm.owner_uuid;
        info.isCore = hasSmartDcRole && ownerIsAdmin;

        if (!info.isCore) {
            callback(null, info);
            return;
        }

        // We assume that the metrics server is exposed
        // on the admin nic
        var nics = vm.nics;
        for (var i = 0; i < nics.length; i++) {
            var nic = nics[i];
            if (nic.nic_tag === 'admin') {
                info.adminIp = nic.ip;
                break;
            }
        }

        var customerMetadata = vm.customer_metadata;
        info.metricPorts = customerMetadata.metricPorts;
        callback(null, info);
    });
}

function getTritonMetadata(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.adminUuid, 'opts.adminUuid');
    mod_assert.object(opts.cache, 'opts.cache');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.uuid(opts.vmUuid, 'opts.vmUuid');
    mod_assert.func(callback, 'callback');

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

function getTritonMetrics(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.adminUuid, 'opts.adminUuid');
    mod_assert.object(opts.cache, 'opts.cache');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.uuid(opts.vmUuid, 'opts.vmUuid');
    mod_assert.func(callback, 'callback');

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
                    var client = mod_restify.createStringClient({
                        url: 'http://' + adminIp + ':' + port
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
