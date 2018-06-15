/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 *
 * The MasterCollector object here is responsible for loading and keeping the
 * list of "collectors" up-to-date. It also exposes functions for calling into
 * those collectors to gather metrics for a VM or GZ.
 *
 * Collectors are loaded from the subdirs:
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
 *   Constructor.getSubCollectors(zonename, callback)
 *
 *     If this exists and is an function, we'll call getSubCollectors(zonename,
 *     callback) and expect that getSubCollectors will call callback(err,
 *     collectorArray) where collectorArray is an array wherein each of the
 *     elements is the name of a subCollector, so when we gather metrics, we'll
 *     make requests for each of these subCollectors.
 *
 *   function Constructor.cacheTTL(opts)
 *
 *     Returns an integer number of seconds we should cache results from this
 *     collector. If the collector has "subCollectors" 'opts' will contain a
 *     subCollectors parameter which indicates which of the subCollectors we'd
 *     like TTL info about. The opts object will also include the zInfo which
 *     has zonename and instanceId properties.
 *
 *   function Constructor.getMetrics(opts, cb)
 *
 *     Takes opts which looks like:
 *
 *         {
 *             subCollector: <String>,
 *             zInfo: {
 *                 instanceId: <Number>,
 *                 zonename: <String>
 *             }
 *         }
 *
 *     where subCollector is optional and only passed if Constructor has a
 *     .getSubCollectors function. This function should gather metrics for the
 *     (sub)collector. Metrics are returned as second argument to cb() as an
 *     array of objects. Each object looks like:
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
var mod_verror = require('verror');

var lib_cache = require('../cache');
var lib_ntp = require('./lib/ntp');
var lib_triton_metrics = require('./lib/triton-metrics');
var lib_zfs = require('./lib/zfs');

var sprintf = require('sprintf-js').sprintf;

var COLLECTOR_DIRS = [];
var COLLECTOR_RELOAD_FREQ = 300 * 1000; // 5 minutes in ms
var COMMON_COLLECTORS_DIR = 'collectors-common';
var GZ_COLLECTORS_DIR = 'collectors-gz';
var VM_COLLECTORS_DIR = 'collectors-vm';

COLLECTOR_DIRS.push(COMMON_COLLECTORS_DIR);
COLLECTOR_DIRS.push(GZ_COLLECTORS_DIR);
COLLECTOR_DIRS.push(VM_COLLECTORS_DIR);

var FMT_PROM = 'prometheus-0.0.4';
var LABELED_METRIC_FMT = '%s%s %s\n';
var META_FMT = '# HELP %s %s\n# TYPE %s %s\n';
var METRIC_FMT = '%s %s\n';
var NS_PER_SEC = 1e9;

var MAX_FAILS = 5; // Max collector failures before ignoring further output

function MasterCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.adminUuid, 'opts.adminUuid');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.optionalObject(opts.metricsManager, 'opts.metricsManager');

    self.adminUuid = opts.adminUuid;
    self.collectorFailures = {};
    self.collectors = {};
    self.log = opts.log;
    self.metricsManager = opts.metricsManager;
    self.running = false;
    self.zones = {};

    self.cache = new lib_cache({
        log: self.log,
        metricsManager: self.metricsManager
    });

    if (self.metricsManager !== undefined) {
        self.collectorTimeHistogram =
            self.metricsManager.collector.histogram({
                name: 'collector_time_seconds',
                help: 'Number of seconds spent collecting metrics'
            });
        self.collectorTotalTimeHistogram =
            self.metricsManager.collector.histogram({
                name: 'collector_time_total_seconds',
                help: 'Total number of seconds spent collecting metrics'
            });
    }

    /*
     * We pass through all the data sources/options to the collectors even
     * though (e.g. in the case of Date.now) it might be easy for them to do
     * it themselves, so that these bits can be overriden for tests.
     */

    self.getCurrentTimestamp = Date.now;
    self.getNtpData = lib_ntp.getNtpData;
    self.getTritonMetadata = lib_triton_metrics.getTritonMetadata;
    self.getTritonMetrics = lib_triton_metrics.getTritonMetrics;
    self.getZfsUsage = lib_zfs.getZfsUsage;
    self.pluginOpts = {};
    self.reader = new mod_kstat.Reader();
}

MasterCollector.prototype.reloadCollectors =
function reloadCollectors(callback) {
    var self = this;

    var collectorCount = 0;
    var collectorOpts = {
        adminUuid: self.adminUuid,
        cache: self.cache,
        getCurrentTimestamp: self.getCurrentTimestamp,
        getNtpData: self.getNtpData,
        getZfsUsage: self.getZfsUsage,
        log: self.log,
        kstatReader: self.reader,
        pluginOpts: self.pluginOpts,
        getTritonMetadata: self.getTritonMetadata,
        getTritonMetrics: self.getTritonMetrics
    };
    var newCollectors = {};

    self.log.trace('(re)loading collectors');

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
                if (!newCollectors.hasOwnProperty(dir)) {
                    newCollectors[dir] = {};
                }
                collectorCount++;

                // If we already knew about this collector, keep the current
                // object instead of creating a new one. Collectors that are
                // removed simply won't be copied.
                if (self.collectors[dir] &&
                    self.collectors[dir][collectorName]) {

                    self.log.trace('collector: ' + dir + '/' + collectorName +
                        ' already exists, keeping current object');
                    newCollectors[dir][collectorName] =
                        self.collectors[dir][collectorName];
                } else {
                    self.log.info('registering collector: ' + dir + '/' +
                        collectorName);
                    newCollectors[dir][collectorName] =
                        new (collectors[collectorName])(collectorOpts);
                }
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

        // reload again in COLLECTOR_RELOAD_FREQ ms
        self.collectorReloadTimer = setTimeout(function _reload() {
            self.reloadCollectors();
        }, COLLECTOR_RELOAD_FREQ);

        // If there's an error, we just log it since we're going to run again
        // next time.
        //
        // TODO if too many errors, should we abort? Or some other way make our
        // distress known?

        if (err) {
            self.log.warn(err, 'failed to (re)load collectors, will try again');
        } else {
            self.collectors = newCollectors;
            self.log.trace({collectorCount: collectorCount},
                '(re)loaded collectors');
        }

        if (callback) {
            callback();
        }
    });
};

MasterCollector.prototype.start = function start(callback) {
    var self = this;

    self.reloadCollectors(function _onReload() {
        if (callback) {
            callback();
        }
    });
};

MasterCollector.prototype.stop = function stop(callback) {
    var self = this;

    clearTimeout(self.collectorReloadTimer);
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

    opts.log.trace({dir: dirPath}, 'loading collectors');

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

function loadOptions(tmetrics) {
    var idx;
    var options = {};
    var tmetric;

    for (idx = 0; idx < tmetrics.length; idx++) {
        tmetric = tmetrics[idx];

        // We're only handling options, ignore everything else.
        if (tmetric.type !== 'option') {
            continue;
        }

        mod_assert.string(tmetric.key, 'tmetric.key');
        mod_assert.string(tmetric.value, 'tmetric.value');

        options[tmetric.key] = tmetric.value;
    }

    return (options);
}

function stringifyMetrics(tmetrics) {
    mod_assert.arrayOfObject(tmetrics, 'tmetrics');

    var idx;
    var tmetric;
    var seenMetrics = {};
    var strMetrics = '';

    for (idx = 0; idx < tmetrics.length; idx++) {
        tmetric = tmetrics[idx];

        // Skip options, they don't go into our output.
        if (tmetric.type === 'option') {
            continue;
        }

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

        if (tmetric.format === 'prom') {
            strMetrics += tmetric.value;
        } else {
            if (tmetric.label === undefined) {
                strMetrics += sprintf(METRIC_FMT, tmetric.key, tmetric.value);
            } else {
                strMetrics += sprintf(LABELED_METRIC_FMT, tmetric.key,
                    tmetric.label, tmetric.value);
            }
        }
    }

    return (strMetrics);
}

/*
 * This takes an array of types (subdirectories like 'collectors-gz') and pulls
 * together all of the collectors under that type, returning an array of objects
 * that looks like:
 *
 *  [
 *      {
 *          name: "arcstats",
 *          type: "collectors-gz"
 *      }
 *      ...
 *  ]
 *
 */
function getCollectors(collectors, collectorTypeKeys) {
    var collectorObjs = [];

    // Find all collectors under the selected collector types and put in
    // 'collectorObjs'.
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

            collectorObjs.push({
                name: collectorKey,
                type: collectorTypeKey
            });
        }
    });

    return (collectorObjs);
}

function addMetaMetrics(collectorKey, opts) {
    mod_assert.string(collectorKey, 'collectorKey');
    mod_assert.object(opts, 'opts');
    mod_assert.bool(opts.available, 'opts.available');
    mod_assert.bool(opts.cached, 'opts.cached');
    mod_assert.number(opts.elapsed, 'opts.elapsed');
    mod_assert.optionalString(opts.subCollector, 'opts.subCollector');

    var prefix = collectorKey;

    if (opts.subCollector !== undefined) {
        prefix = prefix + '_' + opts.subCollector;
    }

    return ([
        '# HELP ' + prefix + '_metrics_available_boolean Whether ' +
            prefix + ' metrics were available, 0 = false, 1 = true',
        '# TYPE ' + prefix + '_metrics_available_boolean gauge',
        prefix + '_metrics_available_boolean ' + (opts.available ? 1 : 0),
        '# HELP ' + prefix + '_metrics_cached_boolean Whether ' +
        prefix + ' metrics came from cache, 0 = false, 1 = true',
        '# TYPE ' + prefix + '_metrics_cached_boolean gauge',
        prefix + '_metrics_cached_boolean ' + (opts.cached ? 1 : 0),
        '# HELP ' + prefix + '_metrics_timer_seconds How long it took ' +
            'to gather the ' + prefix + ' metrics',
        '# TYPE ' + prefix + '_metrics_timer_seconds gauge',
        prefix + '_metrics_timer_seconds ' + opts.elapsed,
        ''
    ].join('\n'));
}

/*
 * This is used to load a single set of metrics from a collector or
 * subCollector. The parameters are all passed in 'opts' and opts are:
 *
 *  cacheKey     - string key we'll use for checking/setting cache results
 *  collector    - collector object (we'll call e.g. collector.getMetrics())
 *  subCollector - name of the subCollector to access from the collector
 *  zInfo        - object with info about which zone we're loading metrics for
 *
 */
MasterCollector.prototype.cachedMetricGet =
function cachedMetricGet(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.cacheKey, 'opts.cacheKey');
    mod_assert.object(opts.collector, 'opts.collector');
    mod_assert.string(opts.name, 'opts.name');
    mod_assert.optionalString(opts.subCollector, 'opts.subCollector');
    mod_assert.object(opts.zInfo, 'opts.zInfo');
    mod_assert.func(callback, 'callback');

    var before;
    var collectorFailed = false;
    var collectorFailures = self.collectorFailures;
    var cache = self.cache;
    var collector = opts.collector;
    var timeDelta;

    before = process.hrtime();

    cache.get(opts.cacheKey, function _onCacheGet(cacheErr, cacheStrMetrics) {
        var dataAvailable = true;
        var getMetricsOpts = {};

        // If a collector has failed at least MAX_FAILS times, then we will
        // short circuit and return no data.
        if (collectorFailures[opts.name] &&
            collectorFailures[opts.name] >= MAX_FAILS) {

            timeDelta = process.hrtime(before);
            callback(null, addMetaMetrics(opts.name, {
                available: false,
                cached: false,
                elapsed: (timeDelta[0] + (timeDelta[1] / NS_PER_SEC)),
                subCollector: opts.subCollector
            }));
            return;
        }

        if (cacheErr) {
            // TODO: should distinguish between miss and error, also add
            // info about hit rate

            // Pass through only those options getMetrics will use.
            getMetricsOpts = {
                subCollector: opts.subCollector,
                zInfo: opts.zInfo
            };

            collector.getMetrics(getMetricsOpts,
                function _gotMetrics(err, tmetrics) {

                var metricsStr;
                var newErr;
                var options = {};
                var ttl = collector.cacheTTL({
                    subCollector: opts.subCollector,
                    zInfo: opts.zInfo
                });

                if (err) {
                    metricsStr = '';

                    if (mod_verror.hasCauseWithName(err,
                       'NotAvailableError')) {

                        self.log.warn(err, opts.cacheKey +
                            ' metrics unavailable, treating as empty');
                    } else {
                        if (collectorFailures[opts.name]) {
                            mod_assert.number(collectorFailures[opts.name],
                                'collectorFailures[opts.name]');
                            collectorFailures[opts.name] += 1;
                        } else {
                            collectorFailures[opts.name] = 1;
                        }

                        dataAvailable = false;
                        collectorFailed = true;
                        self.log.error(
                            {
                                err: err,
                                failureCount: collectorFailures[opts.name]
                            },
                            'failed to get metrics ' + 'for ' + opts.cacheKey);
                    }
                } else {
                    options = loadOptions(tmetrics);
                    if (options.ttl) {
                        // Allow the metrics to override the TTL by adding a ttl
                        // "option" to their results.
                        ttl = Number(options.ttl);
                        mod_assert.number(ttl, 'ttl');
                    }
                    metricsStr = stringifyMetrics(tmetrics);
                    delete collectorFailures[opts.name];
                }

                mod_assert.string(metricsStr, 'metrics should be a string');

                /*
                 * If a metric returns an empty result, unless it sets
                 * collector.EMPTY_OK, we assume that we were unable to
                 * gather the metric and return an 'ENOTFOUND' error. However
                 * in the case of a collector failure we skip this step.
                 */
                if (metricsStr === '' && !collectorFailed) {
                    if (collector.EMPTY_OK !== true) {
                        newErr = new Error('empty metric for ' + opts.cacheKey);
                        newErr.code = 'ENOTFOUND';
                        self.log.warn({err: newErr, cacheKey: opts.cacheKey},
                            'unexpectedly empty metrics, returning ' +
                            'ENOTFOUND');
                        callback(newErr);
                        return;
                    } else {
                        /*
                         * Empty is ok for this metric, so we'll just mark
                         * that the data was unavailable.
                         */
                        dataAvailable = false;
                    }
                }

                if (ttl !== undefined && ttl > 0) {
                    cache.insert(opts.cacheKey, metricsStr, ttl);
                }

                timeDelta = process.hrtime(before);
                callback(null, addMetaMetrics(opts.name, {
                    available: dataAvailable,
                    cached: false,
                    elapsed: (timeDelta[0] + (timeDelta[1] / NS_PER_SEC)),
                    subCollector: opts.subCollector
                }) + metricsStr);
            });
        } else {
            mod_assert.string(cacheStrMetrics, 'cacheStrMetrics');

            /*
             * If the cached data is an empty string, we cached an empty
             * value previously, so we'll consider that as though the data
             * were still unavailable.
             */
            if (cacheStrMetrics === '') {
                dataAvailable = false;
            }

            timeDelta = process.hrtime(before);
            callback(null, addMetaMetrics(opts.name, {
                available: dataAvailable,
                cached: true,
                elapsed: (timeDelta[0] + (timeDelta[1] / NS_PER_SEC)),
                subCollector: opts.subCollector
            }) + cacheStrMetrics);
        }
    });
};

function genCacheKey(opts) {
    // cache key always starts with collectorType/collectorKey
    var components = [opts.type, opts.name];

    // then, if we have a subCollector, we add /subCollector
    if (opts.subCollector) {
        components.push(opts.subCollector);
    }

    // the key then ends with /zonename
    components.push(opts.zonename);

    return components.join('/');
}

MasterCollector.prototype.runCollectors =
function runCollectors(zInfo, collectorObjs, callback) {
    var self = this;

    mod_assert.object(zInfo, 'zInfo');
    mod_assert.number(zInfo.instanceId, 'zInfo.instanceId');
    mod_assert.string(zInfo.zonename, 'zInfo.zonename');
    mod_assert.arrayOfObject(collectorObjs, 'collectorObjs');
    mod_assert.func(callback, 'callback');

    var collectorTimes = {};
    var beginning = process.hrtime();
    var prevEnd;
    var timeDelta;

    function _timeFinish(collectorName) {
        var elapsed;
        var prev = prevEnd || beginning;

        timeDelta = process.hrtime(prev);
        elapsed = (timeDelta[0] + (timeDelta[1] / NS_PER_SEC));
        if (self.collectorTimeHistogram !== undefined) {
            self.collectorTimeHistogram.observe(elapsed, {
                collector: collectorName
            });
        }
        collectorTimes[collectorName] = elapsed;

        prevEnd = process.hrtime();
    }

    mod_vasync.forEachPipeline({
        func: function cachedMetricsGet(obj, cb) {
            mod_assert.object(obj, 'obj');
            mod_assert.string(obj.name, 'obj.name');
            mod_assert.string(obj.type, 'obj.type');
            mod_assert.optionalFunc(obj.getSubCollectors,
                'obj.getSubCollectors');

            var collector = self.collectors[obj.type][obj.name];

            if (typeof (collector.getSubCollectors) === 'function') {
                // Load each subCollector in parallel.
                collector.getSubCollectors({zInfo: zInfo},
                    function _onSubCollectors(err, subCollectors) {

                    mod_assert.ifError(err, 'unexpected error loading ' +
                        'subCollectors for ' + obj.type + '/' + obj.name);

                    mod_vasync.forEachParallel({
                        func: function cachedSubCollectorMetricsGet(sub, next) {
                            self.cachedMetricGet({
                                cacheKey: genCacheKey({
                                    name: obj.name,
                                    subCollector: sub,
                                    type: obj.type,
                                    zonename: zInfo.zonename
                                }),
                                collector: collector,
                                name: obj.name,
                                subCollector: sub,
                                zInfo: zInfo
                            }, next);
                        },
                        inputs: subCollectors
                    }, function _afterSubCollectors(subErr, results) {
                        _timeFinish(obj.name);
                        cb(subErr, results.successes.join(''));
                    });
                });
            } else {
                // No subCollectors, just run the collector.
                self.cachedMetricGet({
                    cacheKey: genCacheKey({
                        name: obj.name,
                        type: obj.type,
                        zonename: zInfo.zonename
                    }),
                    collector: collector,
                    name: obj.name,
                    zInfo: zInfo
                }, function _gotMetric(err, metric) {
                    _timeFinish(obj.name);
                    cb(err, metric);
                });
            }
        },
        inputs: collectorObjs
    }, function _afterCollection(err, results) {
        var elapsed;
        var strMetrics;

        if (!err) {
            strMetrics = results.successes.join('');
        }

        timeDelta = process.hrtime(beginning);
        elapsed = timeDelta[0] + (timeDelta[1] / NS_PER_SEC);
        if (self.collectorTotalTimeHistogram !== undefined) {
            self.collectorTotalTimeHistogram.observe(elapsed);
        }
        self.log.trace({
            collectorTimes: collectorTimes,
            totalTime: elapsed
        }, 'collector times');

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
MasterCollector.prototype.getZoneInfo =
function getZoneInfo(zonename, callback) {
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
MasterCollector.prototype.getMetrics = function getMetrics(vm_uuid, callback) {
    var self = this;

    var collectors;
    var collectorObjs;
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

    collectors = [];
    collectorObjs = getCollectors(self.collectors, collectorTypeKeys);

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
            function _shouldRunCollectors(state, cb) {
                mod_vasync.forEachParallel({
                    func: function shouldCollectorRun(collectorObj, done) {
                        var collector = self
                            .collectors[collectorObj.type][collectorObj.name];

                        if (typeof (collector.shouldRun) === 'function') {
                            collector.shouldRun(state,
                            function _shouldRun(err, shouldRun) {
                                if (err) {
                                    done(err);
                                    return;
                                }

                                if (shouldRun) {
                                    collectors.push(collectorObj);
                                }

                                done();
                            });
                        } else {
                            collectors.push(collectorObj);
                            done();
                        }
                    },
                    inputs: collectorObjs
                }, function onDone(err, results) {
                    if (err) {
                        self.log.error(err);
                    }

                    cb();
                });
            },
            function _runCollectors(state, cb) {
                self.runCollectors(state.zInfo, collectors,
                    function _onCollectorData(err, data) {
                        if (!err) {
                            resultsStr = data;
                        }
                        cb(err);
                    });
            },
            function _addSelfMetrics(_, cb) {
                /*
                 * If we're looking for GZ metrics, and have setup a
                 * metricsManager, include metrics about this cn-agent instance.
                 */
                if (zonename !== 'global' ||
                    self.metricsManager === undefined) {

                    cb();
                    return;
                }

                // Other metrics are triggered on cmon-agent requests via the
                // restify handler, but cache metrics we want to collect just
                // before returning.
                self.metricsManager.collectMetrics('cache');

                self.metricsManager.collector.collect(FMT_PROM,
                    function _onCollected(err, metrics) {
                        if (!err) {
                            resultsStr += metrics;
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

module.exports = MasterCollector;
