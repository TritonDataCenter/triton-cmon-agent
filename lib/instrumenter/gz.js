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

// var lib_common = require('../common');

var forkExecWait = require('forkexec').forkExecWait;

var GZ_ZONE_ID = 0;

function Gz(reader) {
    mod_assert.object(reader, 'reader');

    var self = this;
    self._reader = reader;
    self._kstatMetrics =
    {
        cpu_info: {},
        arcstats: {}
    };

    self._kstatMetrics.arcstats.anon_evictable_data =
    {
        module: 'zfs',
        kstat_key: 'anon_evictable_data',
        key: 'arcstats_anon_evictable_data_bytes',
        type: 'gauge',
        help: 'ARC anonymous evictable data'
    };
    self._kstatMetrics.arcstats.anon_evictable_metadata =
    {
        module: 'zfs',
        kstat_key: 'anon_evictable_metadata',
        key: 'arcstats_anon_evictable_metadata_bytes',
        type: 'gauge',
        help: 'ARC anonymous evictable metadata'
    };
    self._kstatMetrics.arcstats.anon_size =
    {
        module: 'zfs',
        kstat_key: 'anon_size',
        key: 'arcstats_anon_size_bytes',
        type: 'gauge',
        help: 'ARC anonymous size'
    };
    self._kstatMetrics.arcstats.arc_meta_limit =
    {
        module: 'zfs',
        kstat_key: 'arc_meta_limit',
        key: 'arcstats_arc_meta_limit_bytes',
        type: 'gauge',
        help: 'ARC metadata limit'
    };
    self._kstatMetrics.arcstats.arc_meta_max =
    {
        module: 'zfs',
        kstat_key: 'arc_meta_max',
        key: 'arcstats_arc_meta_max_bytes',
        type: 'gauge',
        help: 'ARC metadata maximum observed size'
    };
    self._kstatMetrics.arcstats.arc_meta_min =
    {
        module: 'zfs',
        kstat_key: 'arc_meta_min',
        key: 'arcstats_arc_meta_min_bytes',
        type: 'gauge',
        help: 'ARC metadata minimum'
    };
    self._kstatMetrics.arcstats.arc_meta_used =
    {
        module: 'zfs',
        kstat_key: 'arc_meta_used',
        key: 'arcstats_arc_meta_used_bytes',
        type: 'gauge',
        help: 'ARC metadata used'
    };
    self._kstatMetrics.arcstats.c =
    {
        module: 'zfs',
        kstat_key: 'c',
        key: 'arcstats_target_cache_size_bytes',
        type: 'gauge',
        help: 'ARC target cache size'
    };
    self._kstatMetrics.arcstats.c_max =
    {
        module: 'zfs',
        kstat_key: 'c_max',
        key: 'arcstats_max_target_cache_size_bytes',
        type: 'gauge',
        help: 'ARC maximum target cache size'
    };
    self._kstatMetrics.arcstats.c_min =
    {
        module: 'zfs',
        kstat_key: 'c_min',
        key: 'arcstats_min_target_cache_size_bytes',
        type: 'gauge',
        help: 'ARC minimum target cache size'
    };
    self._kstatMetrics.arcstats.compressed_size =
    {
        module: 'zfs',
        kstat_key: 'compressed_size',
        key: 'arcstats_compressed_size_bytes',
        type: 'gauge',
        help: 'ARC compressed size'
    };
    self._kstatMetrics.arcstats.data_size =
    {
        module: 'zfs',
        kstat_key: 'data_size',
        key: 'arcstats_data_size_bytes',
        type: 'gauge',
        help: 'Number of bytes consumed by ARC buffers backing on disk data'
    };
    self._kstatMetrics.arcstats.demand_data_hits =
    {
        module: 'zfs',
        kstat_key: 'demand_data_hits',
        key: 'arcstats_demand_data_hits_total',
        type: 'counter',
        help: 'ARC demand data hits'
    };
    self._kstatMetrics.arcstats.demand_data_misses =
    {
        module: 'zfs',
        kstat_key: 'demand_data_misses',
        key: 'arcstats_demand_data_misses_total',
        type: 'counter',
        help: 'ARC demand data misses'
    };
    self._kstatMetrics.arcstats.demand_hit_predictive_prefetch =
    {
        module: 'zfs',
        kstat_key: 'demand_hit_predictive_prefetch',
        key: 'arcstats_demand_hit_predictive_prefetch_total',
        type: 'counter',
        help: 'ARC demand hit predictive prefetch'
    };
    self._kstatMetrics.arcstats.demand_metadata_hits =
    {
        module: 'zfs',
        kstat_key: 'demand_metadata_hits',
        key: 'arcstats_demand_metadata_hits_total',
        type: 'counter',
        help: 'ARC demand metadata hits'
    };
    self._kstatMetrics.arcstats.demand_metadata_misses =
    {
        module: 'zfs',
        kstat_key: 'demand_metadata_misses',
        key: 'arcstats_demand_metadata_misses_total',
        type: 'counter',
        help: 'ARC demand metadata misses'
    };
    self._kstatMetrics.arcstats.evict_l2_cached =
    {
        module: 'zfs',
        kstat_key: 'evict_l2_cached',
        key: 'arcstats_evict_l2_cached_bytes_total',
        type: 'counter',
        help: 'ARC l2 cached bytes evicted'
    };
    self._kstatMetrics.arcstats.evict_l2_eligible =
    {
        module: 'zfs',
        kstat_key: 'evict_l2_eligible',
        key: 'arcstats_evict_l2_eligible_bytes_total',
        type: 'counter',
        help: 'ARC l2 cache bytes eligible for eviction'
    };
    self._kstatMetrics.arcstats.evict_l2_ineligible =
    {
        module: 'zfs',
        kstat_key: 'evict_l2_ineligible',
        key: 'arcstats_evict_l2_ineligible_bytes_total',
        type: 'counter',
        help: 'ARC l2 cache bytes ineligible for eviction'
    };
    self._kstatMetrics.arcstats.evict_l2_skip =
    {
        module: 'zfs',
        kstat_key: 'evict_l2_skip',
        key: 'arcstats_evict_l2_skip_total',
        type: 'counter',
        help: 'ARC l2 cache eviction skips'
    };
    self._kstatMetrics.arcstats.evict_not_enough =
    {
        module: 'zfs',
        kstat_key: 'evict_not_enough',
        key: 'arcstats_evict_not_enough_total',
        type: 'counter',
        help: 'ARC count of eviction scans which did satisfy ARC_EVICT_ALL'
    };
    self._kstatMetrics.arcstats.evict_skip =
    {
        module: 'zfs',
        kstat_key: 'evict_skip',
        key: 'arcstats_evict_skip_total',
        type: 'counter',
        help: 'ARC total number of buffers skipped during an eviction'
    };
    self._kstatMetrics.arcstats. =
    {
        module: 'zfs',
        kstat_key: '',
        key: '',
        type: '',
        help: 'ARC '
    };
    self._kstatMetrics.arcstats. =
    {
        module: 'zfs',
        kstat_key: '',
        key: '',
        type: '',
        help: 'ARC '
    };
    self._kstatMetrics.arcstats. =
    {
        module: 'zfs',
        kstat_key: '',
        key: '',
        type: '',
        help: 'ARC '
    };
    self._kstatMetrics.arcstats. =
    {
        module: 'zfs',
        kstat_key: '',
        key: '',
        type: '',
        help: 'ARC '
    };
    self._kstatMetrics.arcstats. =
    {
        module: 'zfs',
        kstat_key: '',
        key: '',
        type: '',
        help: 'ARC '
    };
    self._kstatMetrics.arcstats. =
    {
        module: 'zfs',
        kstat_key: '',
        key: '',
        type: '',
        help: 'ARC '
    };
    self._kstatMetrics.arcstats.hits =
    {
        module: 'zfs',
        kstat_key: 'hits',
        key: 'arcstats_hits_total',
        type: 'counter',
        help: 'ARC hits'
    };
    self._kstatMetrics.arcstats.misses =
    {
        module: 'zfs',
        kstat_key: 'misses',
        key: 'arcstats_misses_total',
        type: 'counter',
        help: 'ARC misses'
    };
    self._kstatMetrics.arcstats.size =
    {
        module: 'zfs',
        kstat_key: 'size',
        key: 'arcstats_size_bytes',
        type: 'gauge',
        help: 'ARC total size in bytes'
    };
    self._kstatMetrics.arcstats.uncompressed_size =
    {
        module: 'zfs',
        kstat_key: 'uncompressed_size',
        key: 'arcstats_uncompressed_size_bytes',
        type: 'gauge',
        help: 'ARC total uncompressed size in bytes'
    };
    self._kstatMetrics.arcstats.prefetch_data_hits =
    {
        module: 'zfs',
        kstat_key: 'prefetch_data_hits',
        key: 'arcstats_prefetch_data_hits_total',
        type: 'counter',
        help: 'ARC prefetch data hits'
    };
    self._kstatMetrics.arcstats.prefetch_data_misses =
    {
        module: 'zfs',
        kstat_key: 'prefetch_data_misses',
        key: 'arcstats_prefetch_data_misses_total',
        type: 'counter',
        help: 'ARC prefetch data misses'
    };
    self._kstatMetrics.arcstats.prefetch_metadata_hits =
    {
        module: 'zfs',
        kstat_key: 'prefetch_metadata_hits',
        key: 'arcstats_prefetch_metadata_hits_total',
        type: 'counter',
        help: 'ARC prefectch metatdata hits'
    };
    self._kstatMetrics.arcstats.prefetch_metadata_misses =
    {
        module: 'zfs',
        kstat_key: 'prefetch_metadata_misses',
        key: 'arcstats_prefetch_metadata_misses_total',
        type: 'counter',
        help: 'ARC prefetch metadata misses'
    };

    self._kstatMetrics.cpu_info.brand =
    {
        module: 'cpu_info',
        kstat_key: 'model',
        key: 'cpu_info_model',
        type: 'gauge',
        help: 'CPU model'
    };

    self._timeMetrics = {};
    self._timeMetrics.now =
    {
        date_key: 'now',
        key: 'time_of_day',
        type: 'counter',
        help: 'System time in seconds since epoch'
    };

    self._zfs_misc_arcstatsReadOpts =
    {
        'class': 'misc',
        name: 'arcstats',
        module: 'zfs',
        instance: GZ_ZONE_ID
    };

    self._cpu_info_miscReadOpts =
    {
        'class': 'misc',
        module: 'cpu_info',
        instance: GZ_ZONE_ID
    };
}

function _mapKstats(kstatMetrics, readerData, cb) {
    mod_assert.object(kstatMetrics, 'kstatMetrics');
    mod_assert.object(readerData, 'readerData');

    var mKeys = Object.keys(kstatMetrics);
    for (var i = 0; i < mKeys.length; i++) {
        var metric = kstatMetrics[mKeys[i]];
        if (metric && metric.module) {
            var kstatValue = readerData[metric.kstat_key];
            metric.value = kstatValue;
        } else {
            cb(new Error('Error retrieving kstat value'));
            return;
        }
    }
    cb(null, kstatMetrics);
}

Gz.prototype.getArcKstats = function getArcKstats(cb) {
    var self = this;
    var arcstats = self._reader.read(self._zfs_misc_arcstatsReadOpts)[0];
    _mapKstats(self._kstatMetrics.arcstats, arcstats.data, cb);
};

Gz.prototype.getCpuInfoKstats = function getCpuInfoKstats(cb) {
    var self = this;
    var cpu_info = self._reader.read(self._cpu_info_miscReadOpts)[0];
    _mapKstats(self._kstatMetrics.cpu_info, cpu_info.data, cb);
};

Gz.prototype.getZfsStats = function getZfsStats(cb) {
    var self = this;
    var zfsName = 'zones/' + self._uuid;
    forkExecWait({
        'argv': ['/usr/sbin/zfs', 'list', '-Hp', zfsName]
    }, function _processZfsOutput(err, data) {
        if (err) {
            cb(err, null);
            return;
        }

        var z = data.stdout.split('\t');
        self._zfsMetrics.zfsUsed.value = z[1];
        self._zfsMetrics.zfsAvailable.value = z[2];
        cb(null, self._zfsMetrics);
        return;
    });
};

Gz.prototype.getTimeStats = function getTimeStats(cb) {
    var self = this;
    self._timeMetrics.now.value = Date.now();
    cb(null, self._timeMetrics);
};

module.exports = Gz;
