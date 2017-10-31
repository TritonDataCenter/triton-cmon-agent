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
var lib_ntp = require('./lib/ntp');
var lib_zfs = require('./lib/zfs');

var sprintf = require('sprintf-js').sprintf;

var COLLECTOR_DIRS = [];
var COMMON_COLLECTORS_DIR = 'collectors-common';
var GZ_COLLECTORS_DIR = 'collectors-gz';
var VM_COLLECTORS_DIR = 'collectors-vm';
COLLECTOR_DIRS.push(COMMON_COLLECTORS_DIR);
COLLECTOR_DIRS.push(GZ_COLLECTORS_DIR);
COLLECTOR_DIRS.push(VM_COLLECTORS_DIR);

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
    self.getNtpData = lib_ntp.getNtpData;
    self.getZfsUsage = lib_zfs.getZfsUsage;
    self.reader = new mod_kstat.Reader();
}

Collector.prototype.start = function start(callback) {
    var self = this;

    var collectorOpts = {
        getCurrentTimestamp: self.getCurrentTimestamp,
        getNtpData: self.getNtpData,
        getZfsUsage: self.getZfsUsage,
        log: self.log,
        kstatReader: self.reader
    };

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

    mod_vasync.forEachPipeline({
        func: registerCollectors,
        inputs: COLLECTOR_DIRS
    }, function afterRegistering(err) {
        if (!err) {
            self.running = true;
        }
        callback(err);
    });
};

Collector.prototype.stop = function stop(callback) {
    var self = this;

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

/*
 * This takes an array of types (subdirectories like 'collectors-gz') and pulls
 * together all of the collectors under that type, returning an array of tuples
 * that look like:
 *
 *  [
 *      ['collectors-gz', 'arcstats'],
 *      ...
 *  ]
 *
 */
function getCollectors(collectors, collectorTypeKeys) {
    var collectorTuples = [];

    // Find all collectors under the selected collector types and put in
    // 'collectorTuples'.
    collectorTypeKeys.forEach(function _eachCollectorTypeKey(collectorTypeKey) {
        var collectorKey;
        var collectorKeys;
        var idx;

        if (!collectors[collectorTypeKey]) {
            return;
        }

        collectorKeys = Object.keys(collectors[collectorTypeKey]);

        for (idx = 0; idx < collectorKeys.length; idx++) {
            collectorKey = collectorKeys[idx];

            collectorTuples.push([collectorTypeKey, collectorKey]);
        }
    });

    return (collectorTuples);
}

Collector.prototype.runCollectors =
function runCollectors(zInfo, collectorTuples, callback) {
    var self = this;

    mod_assert.object(zInfo, 'zInfo');
    mod_assert.number(zInfo.instanceId, 'zInfo.instanceId');
    mod_assert.string(zInfo.zonename, 'zInfo.zonename');
    mod_assert.array(collectorTuples, 'collectorTuples');
    mod_assert.func(callback, 'callback');

    var cache = self.cache;

    // Here so that we have a closure around zInfo when feeding into vasync.
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
        cacheKey = collectorTypeKey + '/' + collectorKey + '/' + zInfo.zonename;
        collector = self.collectors[collectorTypeKey][collectorKey];

        cache.get(cacheKey, function _onCacheGet(cacheErr, cacheStrMetrics) {
            if (cacheErr) {
                // TODO: should distinguish between miss and error, also add
                // info about hit rate
                collector.getMetrics(zInfo,
                    function _gotMetrics(err, tmetrics) {

                    mod_assert.ifError(err, 'failed to get metrics for ' +
                        collectorTypeKey + '/' + collectorKey);

                    var metricsStr = stringifyMetrics(tmetrics);
                    var newErr;
                    var ttl = collector.cacheTTL();

                    mod_assert.string(metricsStr, 'metrics should be a string');

                    /*
                     * If a metric returns an empty result, unless it sets
                     * collector.EMPTY_OK, we assume that we were unable to
                     * gather the metric and return an 'ENOTFOUND' error.
                     */
                    if (metricsStr === '' && collector.EMPTY_OK !== true) {
                        newErr = new Error('empty metric for ' + cacheKey);
                        newErr.code = 'ENOTFOUND';
                        self.log.warn({err: newErr, cacheKey: cacheKey},
                            'unexpectedly empty metrics, returning ENOTFOUND');
                        cb(newErr);
                        return;
                    }

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

/*
 * As some of our checks require the kernel's zone ID, we need need to be able
 * to look that up for running zones. Currently this uses kstats because:
 *
 *  - we already have node-kstat loaded
 *  - this avoids requiring to shell out to anything to do the lookup
 *  - it's fast since we're asking for a specific stat
 *
 * It would be possible to instead use a module that walks the kernel structures
 * similar to what either:
 *
 *     mdb -k -e '::zone'
 *
 * or:
 *
 *     zoneadm list -p
 *
 * do, however such a module is not currently known to exist. If one is written
 * in the future it should be simple to swap that in here.
 *
 * This function calls callback() on completion. If there was an error gathering
 * the data, the first parameter will be an error object. If this error object
 * has a .code parameter that contains 'ENOTFOUND', it means that either:
 *
 *  - the zone does not exist
 *  - the zone is stopped
 *
 * In the case of success, this will call callback(null, <obj>) where '<obj>'
 * will be an object that looks like:
 *
 *  {
 *      instanceId: <number>,
 *      zonename: <zonename>
 *  }
 *
 * Where that instanceId can then be used to do further kstat lookups.
 *
 */
Collector.prototype.getZoneInfo = function getZoneInfo(zonename, callback) {
    var self = this;

    mod_assert.string(zonename, 'zonename');
    mod_assert.func(callback, 'callback');

    var err;
    var idx;
    var info = {
        zonename: zonename
    };
    var kstatsArray;

    if (zonename === 'global') {
        info.instanceId = 0;
    } else {
        kstatsArray = self.reader.read({
            'class': 'zone_misc',
            module: 'zones',
            name: zonename.substr(0, 30) // kstat names are limited to 30 chars
        });

        for (idx = 0; idx < kstatsArray.length; idx++) {
            // Ensure that this is the correct zone, and not an imposter that
            // has the same first 30 characters of zonename.
            if (kstatsArray[idx].data.zonename === zonename) {
                info.instanceId = kstatsArray[idx].instance;
                break;
            }
        }

        if (!Number.isInteger(info.instanceId) || info.instanceId < 1) {
            err = new Error('no zone_misc kstats found for zone ' + zonename);
            err.code = 'ENOTFOUND';
            callback(err);
            return;
        }
    }

    callback(null, info);
};

/* Fetch metrics for a vm_uuid and return a Prometheus compatible response */
Collector.prototype.getMetrics = function getMetrics(vm_uuid, callback) {
    var self = this;

    var collectorTuples;
    var collectorTypeKeys = [COMMON_COLLECTORS_DIR];
    var resultsStr;
    var zonename;

    if (!self.running) {
        callback(new Error('collector is not running'));
        return;
    }

    if (vm_uuid === 'gz') {
        zonename = 'global';
        collectorTypeKeys.push(GZ_COLLECTORS_DIR);
    } else {
        zonename = vm_uuid;
        collectorTypeKeys.push(VM_COLLECTORS_DIR);
    }

    collectorTuples = getCollectors(self.collectors, collectorTypeKeys);

    mod_vasync.pipeline({
        arg: {},
        funcs: [
            function _getZoneInfo(state, cb) {
                self.getZoneInfo(zonename, function _onGetInfo(err, zInfo) {
                    if (!err) {
                        state.zInfo = zInfo;
                    }
                    cb(err);
                });
            },
            function _runCollectors(state, cb) {
                self.runCollectors(state.zInfo, collectorTuples,
                    function _onCollectorData(err, data) {
                        if (!err) {
                            resultsStr = data;
                        }
                        cb(err);
                    });
            },
            function _confirmSanity(state, cb) {
                /*
                 * Ensure that zone's ID and running status didn't change in the
                 * middle of our gathering data via the collectors. If the
                 * instanceId changed that means the zone has stopped and
                 * started and our data will not be complete. If the zone is no
                 * longer running, this data is also not trustworthy since it's
                 * possible some collectors returned empty data because the zone
                 * was down rather than because it was actually empty at the
                 * time of collection.
                 */
                self.getZoneInfo(zonename, function _onGetInfo(err, zInfo) {
                    if (!err) {
                        if (zInfo.zonename !== zonename ||
                            zInfo.instanceId !== state.zInfo.instanceId) {

                            // This is not our zone, return an ENOTFOUND error.
                            err = new Error('_confirmSanity() expected: ' +
                                zonename + '[' + state.zInfo.instanceId + ']' +
                                'got: ' +
                                zInfo.zonename + '[' + zInfo.instanceId + ']');
                            err.code = 'ENOTFOUND';
                        }
                    }
                    cb(err);
                });
            }
        ]
    }, function _afterGetMetrics(err) {
        callback(err, resultsStr);
    });
};

module.exports = Collector;
