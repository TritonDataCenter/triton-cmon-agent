/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 *
 * The Collector is responsible for keeping the zone list up-to-date and exposes
 * the functions for gathering metrics for a VM.
 *
 * Modules are loaded from the subdirs:
 *
 *  collectors-common/ -- collectors that could apply to global and non-global
 *  collectors-gz/     -- for global zone specific collectors
 *  collectors-vm/     -- for non-global zone specific collectors
 *
 * inside each of these directories, we'll load any *.js files and assume that
 * they export a single object which has the properties:
 *
 *   function Constructor(opts)
 *
 *     Takes parameters (e.g. kstatReader) from opts and sets up collector.
 *
 *   function Constructor.cacheTTL()
 *
 *     Returns an integer number of seconds we should cache results from this
 *     collector.
 *
 *   function Constructor.getMetrics(opts, cb)
 *
 *     Takes opts (which includes vm_uuid) and gathers appropriate metrics.
 *     Metrics are returned as second argument to cb() as an array of objects.
 *     Each object looks like:
 *
 *       {
 *           help: <a string describing the metric for the user>,
 *           label: <a prometheus label e.g. '{label=vnic0}'>, (*optional*)
 *           key: <the metric key>,
 *           type: <a prometheus type: 'gauge' or 'counter' currently>,
 *           value: <prometheus compatible string version of the metric value>
 *       }
 *
 *     If an error occurs, cb() should be called with an error object as the
 *     first argument and the second argument should be ignored.
 *
 */

'use strict';

var fs = require('fs');
var path = require('path');

var mod_assert = require('assert-plus');
var mod_kstat = require('kstat');
var mod_vasync = require('vasync');

var lib_cache = require('../cache');
var lib_common = require('../common');
var lib_zfs = require('./lib/zfs');

var sprintf = require('sprintf-js').sprintf;

var COLLECTOR_DIRS = [];
var COMMON_COLLECTORS_DIR = 'collectors-common';
var GZ_COLLECTORS_DIR = 'collectors-gz';
var VM_COLLECTORS_DIR = 'collectors-vm';
COLLECTOR_DIRS.push(COMMON_COLLECTORS_DIR);
COLLECTOR_DIRS.push(GZ_COLLECTORS_DIR);
COLLECTOR_DIRS.push(VM_COLLECTORS_DIR);

var REFRESH_INTERVAL_MS = 30 * 60 * 1000; /* 30 minutes as milliseconds */

var LABELED_METRIC_FMT = '%s%s %s\n';
var META_FMT = '# HELP %s %s\n# TYPE %s %s\n';
var METRIC_FMT = '%s %s\n';

function Collector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.log, 'opts.log');

    self.cache = new lib_cache(opts);
    self.collectors = {};
    self.log = opts.log;
    self.running = false;
    self.zones = {};

    /*
     * We pass through all the data sources to the collectors even though (e.g.
     * in the case of Date.now) it might be easy for them to do it themselves,
     * so that these functions can be overriden for tests.
     */
    self.getCurrentTimestamp = Date.now;
    self.getZfsUsage = lib_zfs.getZfsUsage;
    self.reader = new mod_kstat.Reader();
}

Collector.prototype.start = function start(callback) {
    var self = this;

    var collectorOpts = {
        getCurrentTimestamp: self.getCurrentTimestamp,
        getZfsUsage: self.getZfsUsage,
        kstatReader: self.reader
    };

    /*
     * The refreshZoneCache function will be called as a matter of course any
     * time the cmon proxy is in bootstrap mode or recieves a changefeed event
     * relevant to the agent. This interval is a precautionary measure to ensure
     * the agent zone cache is not stale in the event that the cmon proxy does
     * not properly call the refresh endpoint.
     */
    function _refreshZoneCache(cb) {
        self.refreshZoneCache(function _rfzCb(err) {
            if (err) {
                self.log.error(err, 'Error refreshing zones');
            } else {
                self.log.info('refreshed zones');
            }
            cb(err);
        });
    }

    // Register the collectors from a subdir (e.g. ./collectors-vm/)
    function registerCollectors(dir, cb) {
        loadCollectors(dir, {log: self.log}, function _onLoad(err, collectors) {
            var collectorName;
            var idx;
            var keys;

            if (err) {
                cb(err);
                return;
            }

            keys = Object.keys(collectors);
            for (idx = 0; idx < keys.length; idx++) {
                collectorName = keys[idx];
                if (!self.collectors.hasOwnProperty(dir)) {
                    self.collectors[dir] = {};
                }
                self.log.info('registering collector: ' + dir + '/' +
                    collectorName);
                self.collectors[dir][collectorName] =
                    new collectors[collectorName](collectorOpts);
            }

            cb();
        });
    }

    mod_vasync.pipeline({
        funcs: [
            function _initZoneCache(_, cb) {
                self.refreshInterval =
                    setInterval(_refreshZoneCache, REFRESH_INTERVAL_MS).unref();
                _refreshZoneCache(cb);
            }, function _initCollectors(_, cb) {
                mod_vasync.forEachPipeline({
                    func: registerCollectors,
                    inputs: COLLECTOR_DIRS
                }, function afterRegistering(err) {
                    if (!err) {
                        self.running = true;
                    }
                    cb(err);
                });
            }
        ]
    }, function _donePipeline(err) {
        if (err) {
            // clear the interval if there's any error
            clearInterval(self.refreshInterval);
        }
        callback(err);
    });
};

Collector.prototype.stop = function stop(callback) {
    var self = this;

    clearInterval(self.refreshInterval);
    self.running = false;

    if (callback) {
        callback();
    }
};

function loadCollectors(dir, opts, callback) {
    mod_assert.string(dir, 'dir');
    mod_assert.object(opts, 'opts');
    mod_assert.optionalObject(opts.log, 'opts.log');
    mod_assert.func(callback, 'callback');

    var dirPath = path.join(__dirname, dir);

    // Before requiring any files, we make sure the directory is owned by root.
    fs.stat(dirPath, function onStat(dirStatErr, dirStats) {
        if (dirStatErr) {
            callback(dirStatErr);
            return;
        }

        if (!dirStats.isDirectory()) {
            callback(new Error(dirPath + ' is not a directory'));
            return;
        }

        if (dirStats.uid !== 0) {
            callback(new Error(dirPath + ' is not owned by root'));
            return;
        }

        fs.readdir(dirPath, function onReadDir(loadErr, files) {
            var jsRe = new RegExp('\.js$');
            var collectors = {};

            if (loadErr) {
                callback(loadErr);
                return;
            }

            mod_vasync.forEachPipeline({
                func: function _loadCollector(fileName, cb) {
                    var filePath = path.join(__dirname, dir, fileName);

                    if (jsRe.test(fileName)) {
                        fs.stat(filePath,
                            function onFileStat(fileStatErr, fileStats) {

                            if (fileStatErr) {
                                cb(fileStatErr);
                                return;
                            }

                            if (!fileStats.isFile()) {
                                cb(new Error(filePath + ' is not a file'));
                                return;
                            }

                            if (fileStats.uid !== 0) {
                                cb(new Error(filePath +
                                    ' is not owned by root'));
                                return;
                            }

                            try {
                                // e.g. dir/foo.js -> collectors[foo]
                                collectors[path.basename(fileName, '.js')] =
                                    require(filePath);
                            } catch (requireErr) {
                                cb(requireErr);
                                return;
                            }
                            cb();
                        });
                    } else {
                        if (opts.log) {
                            opts.log.debug('ignoring non-JS / non-module: ' +
                                filePath);
                        }
                        cb();
                    }
                },
                inputs: files
            }, function _afterLoadingCollectors(err) {
                callback(err, collectors);
            });
        });
    });
}

function stringifyMetrics(tmetrics) {
    mod_assert.arrayOfObject(tmetrics, 'tmetrics');

    var idx;
    var tmetric;
    var seenMetrics = {};
    var strMetrics = '';

    for (idx = 0; idx < tmetrics.length; idx++) {
        tmetric = tmetrics[idx];

        mod_assert.string(tmetric.value, 'tmetric.value');

        if (!seenMetrics.hasOwnProperty(tmetric.key)) {
            // Only add the HELP and TYPE if we've not seen this metric key
            // before.
            strMetrics += sprintf(
                META_FMT,
                tmetric.key,
                tmetric.help,
                tmetric.key,
                tmetric.type);
            seenMetrics[tmetric.key] = true;
        }

        if (tmetric.label === undefined) {
            strMetrics += sprintf(METRIC_FMT, tmetric.key, tmetric.value);
        } else {
            strMetrics += sprintf(LABELED_METRIC_FMT, tmetric.key,
                tmetric.label, tmetric.value);
        }
    }

    return (strMetrics);
}

/* Fetch metrics for a vm_uuid and return a Prometheus compatible response */
Collector.prototype.getMetrics = function getMetrics(vm_uuid, callback) {
    var self = this;

    var cache = self.cache;
    var collectorTuples = [];
    var collectorTypeKeys = [COMMON_COLLECTORS_DIR];
    var getErr;
    var vmInstance;

    if (!self.running) {
        callback(new Error('collector is not running'));
        return;
    }

    if (vm_uuid === 'gz') {
        vmInstance = 0; // global is always 0
        collectorTypeKeys.push(GZ_COLLECTORS_DIR);
    } else {
        // If we're not a GZ, we're an NGZ, so we need a uuid of an existing VM
        mod_assert.uuid(vm_uuid, 'vm_uuid');

        if (!self.zones[vm_uuid]) {
            self.log.info({ vm: vm_uuid, zones: self.zones },
                'vm_uuid not found');

            getErr = new Error('VM ' + vm_uuid + ' not found');
            getErr.code = 'ENOTFOUND';

            callback(getErr);
            return;
        }

        mod_assert.object(self.zones[vm_uuid], 'self.zones[vm_uuid]');
        vmInstance = self.zones[vm_uuid].instance;
        collectorTypeKeys.push(VM_COLLECTORS_DIR);
    }

    // here so that we have a closure around vm_uuid when feeding into vasync
    function cachedTupleGet(tuple, cb) {
        var cacheKey;
        var collector;
        var collectorKey;
        var collectorTypeKey;

        mod_assert.array(tuple, 'tuple');
        mod_assert.equal(tuple.length, 2, 'tuple.length is not 2');
        mod_assert.func(cb, 'cb');

        collectorTypeKey = tuple[0];
        collectorKey = tuple[1];
        cacheKey = collectorTypeKey + '/' + collectorKey + '/' + vm_uuid;
        collector = self.collectors[collectorTypeKey][collectorKey];

        cache.get(cacheKey, function _onCacheGet(cacheErr, cacheStrMetrics) {
            if (cacheErr) {
                // TODO: should distinguish between miss and error, also add
                // info about hit rate
                collector.getMetrics({
                    vm_instance: vmInstance,
                    vm_uuid: vm_uuid // NOTE: in the future this could be 'gz'
                }, function _gotMetrics(err, tmetrics) {
                    mod_assert.ifError(err, 'failed to get metrics for ' +
                        collectorTypeKey + '/' + collectorKey);

                    var metricsStr = stringifyMetrics(tmetrics);
                    var ttl = collector.cacheTTL();

                    mod_assert.string(metricsStr, 'metrics should be a string');
                    mod_assert.notEqual(metricsStr, '',
                        'expected non-empty metrics');

                    if (ttl !== undefined && ttl > 0) {
                        cache.insert(cacheKey, metricsStr, ttl);
                    }

                    cb(null, metricsStr);
                });
            } else {
                mod_assert.string(cacheStrMetrics, 'cacheStrMetrics');
                cb(null, cacheStrMetrics);
            }
        });
    }

    // Find all collectors under the selected collector types and put in
    // 'collectorTuples'.
    collectorTypeKeys.forEach(function _eachCollectorTypeKey(collectorTypeKey) {
        var collectorKey;
        var collectorKeys;
        var idx;

        if (!self.collectors[collectorTypeKey]) {
            return;
        }

        collectorKeys = Object.keys(self.collectors[collectorTypeKey]);

        for (idx = 0; idx < collectorKeys.length; idx++) {
            collectorKey = collectorKeys[idx];

            collectorTuples.push([collectorTypeKey, collectorKey]);
        }
    });

    mod_vasync.forEachPipeline({
        func: cachedTupleGet,
        inputs: collectorTuples
    }, function _afterCollection(err, results) {
        var strMetrics;

        if (!err) {
            strMetrics = results.successes.join('');
        }

        callback(err, strMetrics);
        return;
    });
};

/* Refreshes the zone cache needed for mapping vm_uuid to zoneid */
Collector.prototype.refreshZoneCache = function refreshZones(cb) {
    var self = this;

    lib_common.fetchRunningZones(function _frz(err, zones) {
        if (err) {
            cb(err);
            return;
        }

        mod_assert.arrayOfObject(zones, 'zones');
        mod_vasync.forEachPipeline({
            'inputs': zones,
            'func': function _createVm(zone, next) {
                self.zones[zone.uuid] = { instance: zone.zoneid };
                next();
            }
        }, function _handleErr(fepErr) {
            cb(fepErr);
            return;
        });
    });
};

module.exports = Collector;
