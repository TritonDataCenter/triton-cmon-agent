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
var lib_common = require('../common');
var lib_vm = require('./vm');

var sprintf = require('sprintf-js').sprintf;

var REFRESH_INTERVAL_MS = 30 * 60 * 1000; /* 30 minutes as milliseconds */

var KSTAT_LINK_PREFIX = 'link::';
var KSTAT_MEMCAPS_PREFIX = 'memcaps::';
var KSTAT_TCP_PREFIX = 'tcp::';
var KSTAT_ZONE_VFS_PREFIX = 'zone_vfs::';
var KSTAT_ZONES_PREFIX = 'zones::';
var ZFS_PREFIX = 'zfs::';
var KSTAT_TTL = 10;
var ZFS_TTL = 300;

var META_FMT = '# HELP %s %s\n# TYPE %s %s\n';
var METRIC_FMT = '%s %s\n';

function Collector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.log, 'opts.log');

    self.log = opts.log;
    self.zones = {};
    self.cache = new lib_cache(opts);
    self.reader = new mod_kstat.Reader();

    /*
     * The refreshZoneCache function will be called as a matter of course any
     * time the cmon proxy is in bootstrap mode or recieves a changefeed event
     * relevant to the agent. This interval is a precautionary measure to ensure
     * the agent zone cache is not stale in the event that the cmon proxy does
     * not properly call the refresh endpoint.
     */
    function _refreshZoneCache() {
        self.refreshZoneCache(function _rfzCb(err) {
            if (err) {
                self.log.error(err, 'Error refreshing zones');
            } else {
                self.log.info('refreshed zones');
            }
        });
    }

    _refreshZoneCache();
    setInterval(_refreshZoneCache, REFRESH_INTERVAL_MS).unref();
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
Collector.prototype.getMetrics = function getMetrics(vm_uuid, cb) {
    var self = this;

    mod_assert.uuid(vm_uuid, 'vm_uuid');

    if (!this.zones[vm_uuid]) {
        self.log.info({ vm: vm_uuid, zones: this.zones }, 'vm_uuid not found');
        cb();
        return;
    }

    mod_assert.object(this.zones[vm_uuid], 'this.zones[vm_uuid]');
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
                        if (cErr) {
                            next(cErr);
                            return;
                        }

                        _kstatsToStr(val, function _toStrCb(sErr, str) {
                            if (!sErr) {
                                arg.strMetrics += str;
                            }

                            next(sErr);
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
                        if (cErr) {
                            next(cErr);
                            return;
                        }

                        _kstatsToStr(val, function _toStrCb(sErr, str) {
                            if (!sErr) {
                                arg.strMetrics += str;
                            }

                            next(sErr);
                        });
                    });
            },
            function _fetchTcpKstats(arg, next) {
                /* Build up string for kstat metrics */
                var kKey = KSTAT_TCP_PREFIX + vm_uuid;
                _cacheableGet(cache,
                    kKey,
                    KSTAT_TTL,
                    zone.metrics,
                    'getTcpKstats',
                    function _cgCb(cErr, val) {
                        if (cErr) {
                            next(cErr);
                            return;
                        }

                        _kstatsToStr(val, function _toStrCb(sErr, str) {
                            if (!sErr) {
                                arg.strMetrics += str;
                            }

                            next(sErr);
                        });
                    });
            },
            function _fetchZoneVfsKstats(arg, next) {
                /* Build up string for kstat metrics */
                var kKey = KSTAT_ZONE_VFS_PREFIX + vm_uuid;
                _cacheableGet(cache,
                    kKey,
                    KSTAT_TTL,
                    zone.metrics,
                    'getZoneVfsKstats',
                    function _cgCb(cErr, val) {
                        if (cErr) {
                            next(cErr);
                            return;
                        }

                        _kstatsToStr(val, function _toStrCb(sErr, str) {
                            if (!sErr) {
                                arg.strMetrics += str;
                            }

                            next(sErr);
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
                        if (cErr) {
                            next(cErr);
                            return;
                        }

                        _kstatsToStr(val, function _toStrCb(sErr, str) {
                            if (!sErr) {
                                arg.strMetrics += str;
                            }

                            next(sErr);
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
                        if (cErr) {
                            next(cErr);
                            return;
                        }

                        _zfsToStr(val, function _toStrCb(sErr, str) {
                            if (!sErr) {
                                arg.strMetrics += str;
                            }

                            next(sErr);
                        });
                    });
            },
            function _fetchTime(arg, next) {
                zone.metrics.getTimeStats(function _gtsCb(tErr, timeStats) {
                    if (tErr) {
                        next(tErr);
                        return;
                    }

                    _timeToStr(timeStats, function _ttsCb(tStrErr, tStr) {
                        if (!tStrErr) {
                            arg.strMetrics += tStr;
                        }

                        next(tStrErr);
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
                var vm = new lib_vm(zone.uuid, zone.zoneid, self.reader);
                self.zones[zone.uuid] = { instance: zone.zoneid, metrics: vm };
                next();
            }
        }, function _handleErr(fepErr) {
            cb(fepErr);
            return;
        });
    });
};

module.exports = Collector;
