/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

'use strict';

var mod_assert = require('assert-plus');
var mod_kstat = require('kstat');
var mod_vasync = require('vasync');

var lib_cache = require('../cache');
var lib_vm = require('./vm');

var forkExecWait = require('forkexec').forkExecWait;
var sprintf = require('sprintf-js').sprintf;

var KSTAT_LINK_PREFIX = 'link::';
var KSTAT_MEMCAPS_PREFIX = 'memcaps::';
var KSTAT_ZONES_PREFIX = 'zones::';
var ZFS_PREFIX = 'zfs::';
var KSTAT_TTL = 10;
var ZFS_TTL = 300;

var META_FMT = '# HELP %s %s\n# TYPE %s %s\n';
var METRIC_FMT = '%s %s\n';

function Metrics(opts) {
    var self = this;
    self.zones = {};
    self.cache = new lib_cache(opts);
    self.reader = new mod_kstat.Reader();
    self.refreshZoneCache(function _mrfz(err) {
        mod_assert.ifError(err, 'refreshZones error');
    });
}

/* Maps kstats to a Prometheus text format compatible string */
function _kstatsToStr(kstats, cb) {
    var strKstats = '';
    var kkeys = Object.keys(kstats);
    for (var i = 0; i < kkeys.length; i++) {
        var kstatKey = [kkeys[i]];
        var kstat = kstats[kstatKey];
        strKstats += sprintf(
                META_FMT,
                kstat.key,
                kstat.help,
                kstat.key,
                kstat.type);
        if (kstat.value || kstat.value === 0) {
            var modifier = kstat.modifier;
            var kVal = modifier ? modifier(kstat.value) : kstat.value;
            strKstats += sprintf(METRIC_FMT, kstat.key, kVal);
        }
    }
    cb(null, strKstats);
}

/*
 * Get list of all running zones and creates a mapping of vm_uuid to vm object
 * with a valid kstat reader.
 *
 * Derived from sdc-amon listAllZones.
 */
function _listRunningZones(reader, cb) {
    var zones = {};
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
                var zoneid = parseInt(vals[0], 10); /* zoneid integer */
                var uuid = vals[4]; /* uuid or '' for GZ */
                zones[uuid] =
                {
                    instance: zoneid,
                    metrics: new lib_vm(uuid, zoneid, reader)
                };
                next();
            }
        }, function _listRunningZonesHandleFep(fepErr) {
            cb(fepErr, zones);
            return;
        });
    });
}

/* Transforms time data to a Prometheus compatible string */
function _timeToStr(tmetrics, cb) {
    var strTime = '';
    var tkeys = Object.keys(tmetrics);
    for (var i = 0; i < tkeys.length; i++) {
        var tmetricKey = [tkeys[i]];
        var tmetric = tmetrics[tmetricKey];
        strTime += sprintf(
                META_FMT,
                tmetric.key,
                tmetric.help,
                tmetric.key,
                tmetric.type);
        strTime += sprintf(METRIC_FMT, tmetric.key, tmetric.value);
    }
    cb(null, strTime);
}

/* Transforms zfs metrics to a Prometheus compatible string */
function _zfsToStr(zmetrics, cb) {
    var strZfs = '';
    var zkeys = Object.keys(zmetrics);
    for (var i = 0; i < zkeys.length; i++) {
        var zmetricKey = [zkeys[i]];
        var zmetric = zmetrics[zmetricKey];
        strZfs += sprintf(
                META_FMT,
                zmetric.key,
                zmetric.help,
                zmetric.key,
                zmetric.type);
        if (zmetric.value || zmetric.value === 0) {
            strZfs += sprintf(METRIC_FMT, zmetric.key, zmetric.value);
        }
    }
    cb(null, strZfs);
}

/*
 * This function will fetch a value from cache given a cache and a key to obtain
 * the value. If the value does not exist in the cache then it will fetch the
 * value from the source by using the function name supplied by fetchFuncName
 * applied to the metrics object that is passed in.
 */
function _cacheableGet(cache, key, ttl, metrics, fetchFuncName, cb) {
    cache.get(key, function _cacheGetCb(cgErr, cItem) {
        /* value does not exist in the cache, fetch and insert it */
        if (cgErr) {
            metrics[fetchFuncName](function _ffCb(ffErr, obj) {
                mod_assert.ifError(ffErr);
                cache.insert(key, obj, ttl);
                cb(null, obj);
                return;
            });
        } else {
            mod_assert.object(cItem, 'cacheItem');
            cb(null, cItem);
            return;
        }
    });
}

/* Fetch metrics for a vm_uuid and return a Prometheus compatible response */
Metrics.prototype.getMetrics = function getMetrics(vm_uuid, cb) {
    var self = this;
    mod_assert.uuid(vm_uuid);
    mod_assert.object(this.zones[vm_uuid]);
    var zone = this.zones[vm_uuid];
    var vmMetrics = { strMetrics: '' };
    var cache = self.cache;

    mod_vasync.pipeline({
        arg: vmMetrics,
        funcs: [
            function _fetchLinkKstats(arg, next) {
                /* Build up string for kstat metrics */
                var kKey = KSTAT_LINK_PREFIX + vm_uuid;
                _cacheableGet(cache,
                    kKey,
                    KSTAT_TTL,
                    zone.metrics,
                    'getLinkKstats',
                    function _cgCb(cErr, val) {
                        mod_assert.ifError(cErr);
                        _kstatsToStr(val, function _toStrCb(sErr, str) {
                            mod_assert.ifError(sErr);
                            arg.strMetrics += str;
                            next();
                        });
                    });
            },
            function _fetchMemCapsKstats(arg, next) {
                /* Build up string for kstat metrics */
                var kKey = KSTAT_MEMCAPS_PREFIX + vm_uuid;
                _cacheableGet(cache,
                    kKey,
                    KSTAT_TTL,
                    zone.metrics,
                    'getMemCapsKstats',
                    function _cgCb(cErr, val) {
                        mod_assert.ifError(cErr);
                        _kstatsToStr(val, function _toStrCb(sErr, str) {
                            mod_assert.ifError(sErr);
                            arg.strMetrics += str;
                            next();
                        });
                    });
            },
            function _fetchZonesKstats(arg, next) {
                /* Build up string for kstat metrics */
                var kKey = KSTAT_ZONES_PREFIX + vm_uuid;
                _cacheableGet(cache,
                    kKey,
                    KSTAT_TTL,
                    zone.metrics,
                    'getZonesKstats',
                    function _cgCb(cErr, val) {
                        mod_assert.ifError(cErr);
                        _kstatsToStr(val, function _toStrCb(sErr, str) {
                            mod_assert.ifError(sErr);
                            arg.strMetrics += str;
                            next();
                        });
                    });
            },
            function _fetchZfs(arg, next) {
                /* Add zfs metrics to string */
                var zKey = ZFS_PREFIX + vm_uuid;
                _cacheableGet(cache,
                    zKey,
                    ZFS_TTL,
                    zone.metrics,
                    'getZfsStats',
                    function _cgCb(cErr, val) {
                        mod_assert.ifError(cErr);
                        _zfsToStr(val, function _toStrCb(sErr, str) {
                            mod_assert.ifError(sErr);
                            arg.strMetrics += str;
                            next();
                        });
                    });
            },
            function _fetchTime(arg, next) {
                zone.metrics.getTimeStats(function _gtsCb(tErr, timeStats) {
                    mod_assert.ifError(tErr);
                    _timeToStr(timeStats, function _ttsCb(tStrErr, tStr) {
                        mod_assert.ifError(tStrErr);
                        arg.strMetrics += tStr;
                        next();
                    });
                });
            }
        ]
    },
    function _metrics(err) {
        mod_assert.ifError(err, 'Metrics could not be fetched');
        cb(null, vmMetrics.strMetrics);
    });
};

/* Refreshes the zone cache needed for mapping vm_uuid to zoneid */
Metrics.prototype.refreshZoneCache = function refreshZones(cb) {
    var self = this;
    _listRunningZones(self.reader, function _mrfz(err, zones) {
        mod_assert.ifError(err, '_listRunningZones error');
        mod_assert.object(zones, 'zones');
        self.zones = zones;
        cb(err);
    });
};

module.exports = Metrics;
