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
var mod_fs = require('fs');
var mod_jsprim = require('jsprim');
var mod_restify = require('restify');
var mod_vasync = require('vasync');
var mod_verror = require('verror');
var mod_vmadm = require('vmadm');

// Ensure that deleted VMs are eventually removed from the cache
var CACHE_TTL = 3600;
var FMT_PROM = 'prometheus-0.0.4';
var GZ_METRICS_DIR = '/opt/smartdc/agents/metrics/';

function getGzInfo(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.zonename, 'opts.zonename');
    mod_assert.func(callback, 'callback');

     mod_fs.readdir(GZ_METRICS_DIR, function gotFiles(err, files) {
        if (err) {
            callback(err);
            return;
        }

        callback(null, {sockets: files});
    });
}

function getVmInfo(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.adminUuid, 'opts.adminUuid');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.string(opts.zonename, 'opts.zonename');
    mod_assert.func(callback, 'callback');

    var info = {};

    var vmadmOpts = {
        uuid: opts.zonename,
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

function getZonenameInfo(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.adminUuid, 'opts.adminUuid');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.string(opts.zonename, 'opts.zonename');
    mod_assert.func(callback, 'callback');

    function onInfo(err, info) {
        if (err) {
            callback(err);
            return;
        }

        callback(null, info);
    }

    if (opts.zonename === 'global') {
        getGzInfo(opts, onInfo);
    } else {
        getVmInfo(opts, onInfo);
    }
}

function getTritonMetadata(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.adminUuid, 'opts.adminUuid');
    mod_assert.object(opts.cache, 'opts.cache');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.string(opts.zonename, 'opts.zonename');
    mod_assert.func(callback, 'callback');

    var cache = opts.cache;
    var cacheKey = 'triton-metrics/' + opts.zonename;

    cache.get(cacheKey,
    function gotCache(cacheErr, cachedInfo) {
        // err or cache miss
        if (cacheErr) {
            getZonenameInfo(opts, function gotZonenameInfo(err, info) {
                if (err) {
                    callback(err);
                    return;
                }

                cache.insert(cacheKey, info, CACHE_TTL);
                callback(null, info);
            });
        } else {
            callback(null, cachedInfo);
        }
    });
}

function createClients(opts) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.metadata, 'opts.metadata');
    mod_assert.optionalString(opts.metadata.adminIp, 'opts.metadata.adminIp');
    mod_assert.optionalString(opts.metadata.metricPorts,
        'opts.metadata.metricPorts');
    mod_assert.optionalArray(opts.metadata.sockets, 'opts.metadata.sockets');
    mod_assert.string(opts.zonename, 'opts.zonename');

    var clients = [];

    if (opts.zonename === 'global' && opts.metadata.sockets) {
        clients = opts.metadata.sockets.map(function buildClients(socket) {
            return mod_restify.createStringClient({
                socketPath: GZ_METRICS_DIR + socket
            });
        });
    } else if (opts.metadata.adminIp && opts.metadata.metricPorts) {
        var adminIp = opts.metadata.adminIp;

        // metricPorts must be comma separated without spaces
        // Ex. 8881,8882,8883,8884
        var metricPorts = opts.metadata.metricPorts.split(',');
        for (var i = 0; i < metricPorts.length; i++) {
            var parsedPort = mod_jsprim.parseInteger(metricPorts[i]);
            if (parsedPort instanceof Error) {
                return new Error('Invalid metric ports: ' +
                    JSON.stringify(metricPorts));
            }
        }

        clients = metricPorts.map(function buildClients(port) {
            return mod_restify.createStringClient({
                url: 'http://' + adminIp + ':' + port
            });
        });
    }

    return clients;
}

function getTritonMetrics(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.adminUuid, 'opts.adminUuid');
    mod_assert.object(opts.cache, 'opts.cache');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.object(opts.metricsManager, 'opts.metricsManager');
    mod_assert.string(opts.zonename, 'opts.zonename');
    mod_assert.func(callback, 'callback');

    getTritonMetadata(opts, function gotMetadata(err, metadata) {
        if (err) {
            callback(err);
            return;
        }

        opts.metadata = metadata;

        var clients = createClients(opts);

        if (clients instanceof Error) {
            callback(clients);
            return;
        }

        mod_vasync.forEachParallel({
            func: function getMetrics(client, done) {
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
            inputs: clients
        }, function gotAllMetrics(_err, results) {
            if (_err) {
                callback(_err);
                return;
            }

            if (opts.zonename === 'global' && opts.metricsManager) {
                opts.metricsManager.collectMetrics('cache');
                opts.metricsManager.collector.collect(FMT_PROM,
                function _onCollected(managerErr, metrics) {
                    if (managerErr) {
                        callback(managerErr);
                        return;
                    }

                    results.successes.push(metrics);
                    callback(null, results.successes);
                });
            } else {
                callback(null, results.successes);
            }
        });
    });
}

module.exports = {
    getTritonMetrics: getTritonMetrics,
    getTritonMetadata: getTritonMetadata
};
