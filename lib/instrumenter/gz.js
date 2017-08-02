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
        help: 'ARC count of eviction scans which did not satisfy ARC_EVICT_ALL'
    };
    self._kstatMetrics.arcstats.evict_skip =
    {
        module: 'zfs',
        kstat_key: 'evict_skip',
        key: 'arcstats_evict_skip_total',
        type: 'counter',
        help: 'ARC total number of buffers skipped during an eviction'
    };
    self._kstatMetrics.arcstats.hash_chain_max =
    {
        module: 'zfs',
        kstat_key: 'hash_chain_max',
        key: 'arcstats_hash_chain_max',
        type: 'gauge',
        help: 'ARC hash chain maximum'
    };
    self._kstatMetrics.arcstats.hash_chains =
    {
        module: 'zfs',
        kstat_key: 'hash_chains',
        key: 'arcstats_hash_chains',
        type: 'gauge',
        help: 'ARC hash chains'
    };
    self._kstatMetrics.arcstats.hash_collisions =
    {
        module: 'zfs',
        kstat_key: 'hash_collisions',
        key: 'arcstats_hash_collisions_total',
        type: 'counter',
        help: 'ARC hash collisions'
    };
    self._kstatMetrics.arcstats.hash_elements =
    {
        module: 'zfs',
        kstat_key: 'hash_elements',
        key: 'arcstats_hash_elements',
        type: 'gauge',
        help: 'ARC hash elements'
    };
    self._kstatMetrics.arcstats.hash_elements_max =
    {
        module: 'zfs',
        kstat_key: 'hash_elements_max',
        key: 'arcstats_hash_elements_max',
        type: 'gauge',
        help: 'ARC hash elements maximum'
    };
    self._kstatMetrics.arcstats.hdr_size =
    {
        module: 'zfs',
        kstat_key: 'hdr_size',
        key: 'arcstats_hdr_size',
        type: 'counter',
        help: 'Number of bytes consumed by internal ARC structures'
    };
    self._kstatMetrics.arcstats.hits =
    {
        module: 'zfs',
        kstat_key: 'hits',
        key: 'arcstats_hits_total',
        type: 'counter',
        help: 'ARC hits'
    };
    self._kstatMetrics.arcstats.l2_abort_lowmem =
    {
        module: 'zfs',
        kstat_key: 'l2_abort_lowmem',
        key: 'arcstats_l2_abort_lowmem_total',
        type: 'counter',
        help: 'ARC l2 low memory aborts'
    };
    self._kstatMetrics.arcstats.l2_asize =
    {
        module: 'zfs',
        kstat_key: 'l2_asize',
        key: 'arcstats_l2_asize_bytes',
        type: 'gauge',
        help: 'ARC l2 actual size in bytes after compression'
    };
    self._kstatMetrics.arcstats.l2_cksum_bad =
    {
        module: 'zfs',
        kstat_key: 'l2_cksum_bad',
        key: 'arcstats_l2_cksum_bad_total',
        type: 'counter',
        help: 'ARC l2 total bad checksums encountered'
    };
    self._kstatMetrics.arcstats.l2_evict_l1cached =
    {
        module: 'zfs',
        kstat_key: 'l2_evict_l1cached',
        key: 'arcstats_l2_evict_l1cached_total',
        type: 'counter',
        help: 'ARC l2 evictions which also result in l1 cache evictions'
    };
    self._kstatMetrics.arcstats.l2_evict_lock_retry =
    {
        module: 'zfs',
        kstat_key: 'l2_evict_lock_retry',
        key: 'arcstats_l2_evict_lock_retry_total',
        type: 'counter',
        help: 'ARC l2 evictions that fail and retry because of a hash lock miss'
    };
    self._kstatMetrics.arcstats.l2_evict_reading =
    {
        module: 'zfs',
        kstat_key: 'l2_evict_reading',
        key: 'arcstats_l2_evict_reading_total',
        type: 'counter',
        help: 'ARC l2 eviction of a block that is being or about to be read'
    };
    self._kstatMetrics.arcstats.l2_feeds =
    {
        module: 'zfs',
        kstat_key: 'l2_feeds',
        key: 'arcstats_l2_feeds_total',
        type: 'counter',
        help: 'ARC l2 arc feed loop execution count'
    };
    self._kstatMetrics.arcstats.l2_free_on_write =
    {
        module: 'zfs',
        kstat_key: 'l2_free_on_write',
        key: 'arcstats_l2_free_on_write_total',
        type: 'counter',
        help: 'ARC l2 headers added to the free on write list'
    };
    self._kstatMetrics.arcstats.l2_hdr_size =
    {
        module: 'zfs',
        kstat_key: 'l2_hdr_size',
        key: 'arcstats_l2_hdr_bytes',
        type: 'gauge',
        help: 'ARC l2 header bytes'
    };
    self._kstatMetrics.arcstats.l2_hits =
    {
        module: 'zfs',
        kstat_key: 'l2_hits',
        key: 'arcstats_l2_hits_total',
        type: 'counter',
        help: 'ARC l2 cache hits'
    };
    self._kstatMetrics.arcstats.l2_io_error =
    {
        module: 'zfs',
        kstat_key: 'l2_io_error',
        key: 'arcstats_l2_io_error_total',
        type: 'counter',
        help: 'ARC io error when reading from l2'
    };
    self._kstatMetrics.arcstats.l2_misses =
    {
        module: 'zfs',
        kstat_key: 'l2_misses',
        key: 'arcstats_l2_misses_total',
        type: 'counter',
        help: 'ARC l2 misses'
    };
    self._kstatMetrics.arcstats.l2_read_bytes =
    {
        module: 'zfs',
        kstat_key: 'l2_read_bytes',
        key: 'arcstats_l2_read_bytes',
        type: 'gauge',
        help: 'ARC bytes read from l2'
    };
    self._kstatMetrics.arcstats.l2_rw_clash =
    {
        module: 'zfs',
        kstat_key: 'l2_rw_clash',
        key: 'arcstats_l2_rw_clash',
        type: 'counter',
        help: 'ARC l2 read errors due to active L2 write'
    };
    self._kstatMetrics.arcstats.l2_size =
    {
        module: 'zfs',
        kstat_key: 'l2_size',
        key: 'arcstats_l2_size',
        type: 'gauge',
        help: 'ARC l2 size'
    };
    self._kstatMetrics.arcstats.l2_write_bytes =
    {
        module: 'zfs',
        kstat_key: 'l2_write_bytes',
        key: 'arcstats_l2_write_bytes',
        type: 'counter',
        help: 'ARC l2 cummulative bytes written'
    };
    self._kstatMetrics.arcstats.l2_writes_done =
    {
        module: 'zfs',
        kstat_key: 'l2_writes_done',
        key: 'arcstats_l2_writes_done',
        type: 'counter',
        help: 'ARC l2 cummulative writes done'
    };
    self._kstatMetrics.arcstats.l2_writes_error =
    {
        module: 'zfs',
        kstat_key: 'l2_writes_error',
        key: 'arcstats_l2_writes_error',
        type: 'counter',
        help: 'ARC l2 write errors'
    };
    self._kstatMetrics.arcstats.l2_writes_lock_retry =
    {
        module: 'zfs',
        kstat_key: 'l2_writes_lock_retry',
        key: 'arcstats_l2_writes_lock_retry',
        type: 'counter',
        help: 'ARC l2 writes which missed the hash lock resulting in a retry'
    };
    self._kstatMetrics.arcstats.l2_writes_sent =
    {
        module: 'zfs',
        kstat_key: 'l2_writes_sent',
        key: 'arcstats_l2_writes_sent',
        type: 'counter',
        help: 'ARC l2 cummulative writes sent'
    };
    self._kstatMetrics.arcstats.memory_throttle_count =
    {
        module: 'zfs',
        kstat_key: 'memory_throttle_count',
        key: 'arcstats_memory_throttle_count',
        type: 'counter',
        help: 'ARC page load delayed due to low memory'
    };
    self._kstatMetrics.arcstats.metadata_size =
    {
        module: 'zfs',
        kstat_key: 'metadata_size',
        key: 'arcstats_metadata_size',
        type: 'gauge',
        help: 'Number of bytes consumed by ARC metadata buffers'
    };
    self._kstatMetrics.arcstats.mfu_evictable_data =
    {
        module: 'zfs',
        kstat_key: 'mfu_evictable_data',
        key: 'arcstats_mfu_evictable_data',
        type: 'gauge',
        help: 'Bytes consumed by ARC data buffers that are evictable'
    };
    self._kstatMetrics.arcstats.mfu_evictable_metadata =
    {
        module: 'zfs',
        kstat_key: 'mfu_evictable_metadata',
        key: 'arcstats_mfu_evictable_metadata',
        type: 'gauge',
        help: 'Bytes consumed by ARC metadata buffers that are evictable'
    };
    self._kstatMetrics.arcstats.mfu_ghost_evictable_data =
    {
        module: 'zfs',
        kstat_key: 'mfu_ghost_evictable_data',
        key: 'arcstats_mfu_ghost_evictable_data',
        type: 'gauge',
        help: ''
    };
    self._kstatMetrics.arcstats.m =
    {
        module: 'zfs',
        kstat_key: '',
        key: 'arcstats_m',
        type: '',
        help: 'ARC '
    };
    self._kstatMetrics.arcstats.m =
    {
        module: 'zfs',
        kstat_key: '',
        key: 'arcstats_m',
        type: '',
        help: 'ARC '
    };
    self._kstatMetrics.arcstats.m =
    {
        module: 'zfs',
        kstat_key: '',
        key: 'arcstats_m',
        type: '',
        help: 'ARC '
    };
    self._kstatMetrics.arcstats.m =
    {
        module: 'zfs',
        kstat_key: '',
        key: 'arcstats_m',
        type: '',
        help: 'ARC '
    };
    self._kstatMetrics.arcstats.m =
    {
        module: 'zfs',
        kstat_key: '',
        key: 'arcstats_m',
        type: '',
        help: 'ARC '
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
