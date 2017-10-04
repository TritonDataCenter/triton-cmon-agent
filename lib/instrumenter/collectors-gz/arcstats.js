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
var kstat_common = require('../lib/kstat-common');

var ARCSTAT_READ_OPTS = {
    'class': 'misc',
    name: 'arcstats',
    module: 'zfs',
    instance: kstat_common.GZ_ZONE_ID
};

var ARCSTAT_KSTATS = [
    {
        'kstat_key': 'anon_evictable_data',
        'key': 'arcstats_anon_evictable_data_bytes',
        'type': 'gauge',
        'help': 'ARC anonymous evictable data'
    },
    {
        'kstat_key': 'anon_evictable_metadata',
        'key': 'arcstats_anon_evictable_metadata_bytes',
        'type': 'gauge',
        'help': 'ARC anonymous evictable metadata'
    },
    {
        'kstat_key': 'anon_size',
        'key': 'arcstats_anon_size_bytes',
        'type': 'gauge',
        'help': 'ARC anonymous size'
    },
    {
        'kstat_key': 'arc_meta_limit',
        'key': 'arcstats_arc_meta_limit_bytes',
        'type': 'gauge',
        'help': 'ARC metadata limit'
    },
    {
        'kstat_key': 'arc_meta_max',
        'key': 'arcstats_arc_meta_max_bytes',
        'type': 'gauge',
        'help': 'ARC metadata maximum observed size'
    },
    {
        'kstat_key': 'arc_meta_min',
        'key': 'arcstats_arc_meta_min_bytes',
        'type': 'gauge',
        'help': 'ARC metadata minimum'
    },
    {
        'kstat_key': 'arc_meta_used',
        'key': 'arcstats_arc_meta_used_bytes',
        'type': 'gauge',
        'help': 'ARC metadata used'
    },
    {
        'kstat_key': 'c',
        'key': 'arcstats_target_cache_size_bytes',
        'type': 'gauge',
        'help': 'ARC target cache size'
    },
    {
        'kstat_key': 'c_max',
        'key': 'arcstats_max_target_cache_size_bytes',
        'type': 'gauge',
        'help': 'ARC maximum target cache size'
    },
    {
        'kstat_key': 'c_min',
        'key': 'arcstats_min_target_cache_size_bytes',
        'type': 'gauge',
        'help': 'ARC minimum target cache size'
    },
    {
        'kstat_key': 'compressed_size',
        'key': 'arcstats_compressed_size_bytes',
        'type': 'gauge',
        'help': 'ARC compressed size'
    },
    {
        'kstat_key': 'data_size',
        'key': 'arcstats_data_size_bytes',
        'type': 'gauge',
        'help': 'Number of bytes consumed by ARC buffers backing on disk data'
    },
    {
        'kstat_key': 'demand_data_hits',
        'key': 'arcstats_demand_data_hits_total',
        'type': 'counter',
        'help': 'ARC demand data hits'
    },
    {
        'kstat_key': 'demand_data_misses',
        'key': 'arcstats_demand_data_misses_total',
        'type': 'counter',
        'help': 'ARC demand data misses'
    },
    {
        'kstat_key': 'demand_hit_predictive_prefetch',
        'key': 'arcstats_demand_hit_predictive_prefetch_total',
        'type': 'counter',
        'help': 'ARC demand hit predictive prefetch'
    },
    {
        'kstat_key': 'demand_metadata_hits',
        'key': 'arcstats_demand_metadata_hits_total',
        'type': 'counter',
        'help': 'ARC demand metadata hits'
    },
    {
        'kstat_key': 'demand_metadata_misses',
        'key': 'arcstats_demand_metadata_misses_total',
        'type': 'counter',
        'help': 'ARC demand metadata misses'
    },
    {
        'kstat_key': 'evict_l2_cached',
        'key': 'arcstats_evict_l2_cached_bytes_total',
        'type': 'counter',
        'help': 'ARC l2 cached bytes evicted'
    },
    {
        'kstat_key': 'evict_l2_eligible',
        'key': 'arcstats_evict_l2_eligible_bytes_total',
        'type': 'counter',
        'help': 'ARC l2 cache bytes eligible for eviction'
    },
    {
        'kstat_key': 'evict_l2_ineligible',
        'key': 'arcstats_evict_l2_ineligible_bytes_total',
        'type': 'counter',
        'help': 'ARC l2 cache bytes ineligible for eviction'
    },
    {
        'kstat_key': 'evict_l2_skip',
        'key': 'arcstats_evict_l2_skip_total',
        'type': 'counter',
        'help': 'ARC l2 cache eviction skips'
    },
    {
        'kstat_key': 'evict_not_enough',
        'key': 'arcstats_evict_not_enough_total',
        'type': 'counter',
        'help': 'ARC count of eviction scans which did not satisfy ' +
            'ARC_EVICT_ALL'
    },
    {
        'kstat_key': 'evict_skip',
        'key': 'arcstats_evict_skip_total',
        'type': 'counter',
        'help': 'ARC total number of buffers skipped during an eviction'
    },
    {
        'kstat_key': 'hash_chain_max',
        'key': 'arcstats_hash_chain_max',
        'type': 'gauge',
        'help': 'ARC hash chain maximum'
    },
    {
        'kstat_key': 'hash_chains',
        'key': 'arcstats_hash_chains',
        'type': 'gauge',
        'help': 'ARC hash chains'
    },
    {
        'kstat_key': 'hash_collisions',
        'key': 'arcstats_hash_collisions_total',
        'type': 'counter',
        'help': 'ARC hash collisions'
    },
    {
        'kstat_key': 'hash_elements',
        'key': 'arcstats_hash_elements',
        'type': 'gauge',
        'help': 'ARC hash elements'
    },
    {
        'kstat_key': 'hash_elements_max',
        'key': 'arcstats_hash_elements_max',
        'type': 'gauge',
        'help': 'ARC hash elements maximum'
    },
    {
        'kstat_key': 'hdr_size',
        'key': 'arcstats_hdr_size_bytes',
        'type': 'counter',
        'help': 'Number of bytes consumed by internal ARC structures'
    },
    {
        'kstat_key': 'hits',
        'key': 'arcstats_hits_total',
        'type': 'counter',
        'help': 'ARC hits'
    },
    {
        'kstat_key': 'l2_abort_lowmem',
        'key': 'arcstats_l2_abort_lowmem_total',
        'type': 'counter',
        'help': 'ARC l2 low memory aborts'
    },
    {
        'kstat_key': 'l2_asize',
        'key': 'arcstats_l2_asize_bytes',
        'type': 'gauge',
        'help': 'ARC l2 actual size in bytes after compression'
    },
    {
        'kstat_key': 'l2_cksum_bad',
        'key': 'arcstats_l2_cksum_bad_total',
        'type': 'counter',
        'help': 'ARC l2 total bad checksums encountered'
    },
    {
        'kstat_key': 'l2_evict_l1cached',
        'key': 'arcstats_l2_evict_l1cached_total',
        'type': 'counter',
        'help': 'ARC l2 evictions which also result in l1 cache evictions'
    },
    {
        'kstat_key': 'l2_evict_lock_retry',
        'key': 'arcstats_l2_evict_lock_retry_total',
        'type': 'counter',
        'help': 'ARC l2 evictions that fail and retry because of a hash ' +
            'lock miss'
    },
    {
        'kstat_key': 'l2_evict_reading',
        'key': 'arcstats_l2_evict_reading_total',
        'type': 'counter',
        'help': 'ARC l2 eviction of a block that is being or about to be read'
    },
    {
        'kstat_key': 'l2_feeds',
        'key': 'arcstats_l2_feeds_total',
        'type': 'counter',
        'help': 'ARC l2 arc feed loop execution count'
    },
    {
        'kstat_key': 'l2_free_on_write',
        'key': 'arcstats_l2_free_on_write_total',
        'type': 'counter',
        'help': 'ARC l2 headers added to the free on write list'
    },
    {
        'kstat_key': 'l2_hdr_size',
        'key': 'arcstats_l2_hdr_bytes',
        'type': 'gauge',
        'help': 'ARC l2 header bytes'
    },
    {
        'kstat_key': 'l2_hits',
        'key': 'arcstats_l2_hits_total',
        'type': 'counter',
        'help': 'ARC l2 cache hits'
    },
    {
        'kstat_key': 'l2_io_error',
        'key': 'arcstats_l2_io_error_total',
        'type': 'counter',
        'help': 'ARC io error when reading from l2'
    },
    {
        'kstat_key': 'l2_misses',
        'key': 'arcstats_l2_misses_total',
        'type': 'counter',
        'help': 'ARC l2 misses'
    },
    {
        'kstat_key': 'l2_read_bytes',
        'key': 'arcstats_l2_read_bytes',
        'type': 'gauge',
        'help': 'ARC bytes read from l2'
    },
    {
        'kstat_key': 'l2_rw_clash',
        'key': 'arcstats_l2_rw_clash_total',
        'type': 'counter',
        'help': 'ARC l2 read errors due to active L2 write'
    },
    {
        'kstat_key': 'l2_size',
        'key': 'arcstats_l2_size_bytes',
        'type': 'gauge',
        'help': 'ARC l2 size in bytes'
    },
    {
        'kstat_key': 'l2_write_bytes',
        'key': 'arcstats_l2_write_bytes',
        'type': 'counter',
        'help': 'ARC l2 cummulative bytes written'
    },
    {
        'kstat_key': 'l2_writes_done',
        'key': 'arcstats_l2_writes_done_total',
        'type': 'counter',
        'help': 'ARC l2 cummulative writes done'
    },
    {
        'kstat_key': 'l2_writes_error',
        'key': 'arcstats_l2_writes_error_total',
        'type': 'counter',
        'help': 'ARC l2 write errors'
    },
    {
        'kstat_key': 'l2_writes_lock_retry',
        'key': 'arcstats_l2_writes_lock_retry_total',
        'type': 'counter',
        'help': 'ARC l2 writes which missed the hash lock resulting in a retry'
    },
    {
        'kstat_key': 'l2_writes_sent',
        'key': 'arcstats_l2_writes_sent_total',
        'type': 'counter',
        'help': 'ARC l2 cummulative writes sent'
    },
    {
        'kstat_key': 'memory_throttle_count',
        'key': 'arcstats_memory_throttle_count',
        'type': 'counter',
        'help': 'ARC page load delayed due to low memory'
    },
    {
        'kstat_key': 'metadata_size',
        'key': 'arcstats_metadata_size_bytes',
        'type': 'gauge',
        'help': 'Number of bytes consumed by ARC metadata buffers'
    },
    {
        'kstat_key': 'mfu_evictable_data',
        'key': 'arcstats_mfu_evictable_data_bytes',
        'type': 'gauge',
        'help': 'Bytes consumed by ARC data buffers that are evictable'
    },
    {
        'kstat_key': 'mfu_evictable_metadata',
        'key': 'arcstats_mfu_evictable_metadata_bytes',
        'type': 'gauge',
        'help': 'Bytes consumed by ARC metadata buffers that are evictable'
    },
    {
        'kstat_key': 'mfu_ghost_evictable_data',
        'key': 'arcstats_mfu_ghost_evictable_data',
        'type': 'gauge',
        'help': 'Evictable data bytes that would have been consumed by ARC'
    },
    {
        'kstat_key': 'mfu_ghost_evictable_metadata',
        'key': 'arcstats_mfu_ghost_evictable_metadata_bytes',
        'type': 'gauge',
        'help': 'Evictable metadata bytes that would have been consumed by ARC'
    },
    {
        'kstat_key': 'mfu_ghost_hits',
        'key': 'arcstats_mfu_ghost_hits_total',
        'type': 'counter',
        'help': 'ARC hits for MFU ghost data (data accessed more than once, ' +
            'but has been evicted from cache)'
    },
    {
        'kstat_key': 'mfu_ghost_size',
        'key': 'arcstats_mfu_ghost_size_bytes',
        'type': 'gauge',
        'help': 'Evictable bytes that would have been consumed by ARC ' +
            'buffers in the arc_mfu_ghost state'
    },
    {
        'kstat_key': 'mfu_hits',
        'key': 'arcstats_mfu_hits_total',
        'type': 'counter',
        'help': 'ARC hits for data in the MFU state'
    },
    {
        'kstat_key': 'mfu_size',
        'key': 'arcstats_mfu_size_bytes',
        'type': 'gauge',
        'help': 'Total number of bytes consumed by ARC buffers in the MFU state'
    },
    {
        'kstat_key': 'misses',
        'key': 'arcstats_misses_total',
        'type': 'counter',
        'help': 'ARC misses'
    },
    {
        'kstat_key': 'mru_evictable_data',
        'key': 'arcstats_mru_evictable_data_bytes',
        'type': 'gauge',
        'help': 'Bytes consumed by ARC buffers of type ARC_BUFC_DATA, ' +
            'residing in the arc_mru state, and eligible for eviction'
    },
    {
        'kstat_key': 'mru_evictable_metadata',
        'key': 'arcstats_mru_evictable_metadata_bytes',
        'type': 'gauge',
        'help': 'Bytes consumed by ARC buffers of type ARC_BUFC_METADATA, ' +
            'residing in the arc_mru state, and eligible for eviction'
    },
    {
        'kstat_key': 'mru_ghost_evictable_data',
        'key': 'arcstats_mru_ghost_evictable_data_bytes',
        'type': 'gauge',
        'help': 'Bytes that would have been consumed by ARC buffers and of ' +
            'type ARC_BUFC_DATA, and linked off the arc_mru_ghost state'
    },
    {
        'kstat_key': 'mru_ghost_evictable_metadata',
        'key': 'arcstats_mru_ghost_evictable_metadata_bytes',
        'type': 'gauge',
        'help': 'Bytes that would have been consumed by ARC buffers and of ' +
            'type ARC_BUFC_METADATA, and linked off the arc_mru_ghost state'
    },
    {
        'kstat_key': 'mru_ghost_hits',
        'key': 'arcstats_mru_ghost_hits_total',
        'type': 'counter',
        'help': 'ARC hits for MRU ghost data (data accessed recently, but ' +
            'has been evicted from cache)'
    },
    {
        'kstat_key': 'mru_ghost_size',
        'key': 'arcstats_mru_ghost_size_bytes',
        'type': 'gauge',
        'help': 'Total bytes that would have been consumed by ARC buffers in ' +
            'the arc_mru_ghost state. (This is not DRAM consumption)'
    },
    {
        'kstat_key': 'mru_hits',
        'key': 'arcstats_mru_hits_total',
        'type': 'counter',
        'help': 'Total MRU hits'
    },
    {
        'kstat_key': 'mru_size',
        'key': 'arcstats_mru_size_bytes',
        'type': 'gauge',
        'help': 'Total number of bytes consumed by ARC buffers in the ' +
            'arc_mru state'
    },
    {
        'kstat_key': 'mutex_miss',
        'key': 'arcstats_mutex_miss_total',
        'type': 'counter',
        'help': 'Buffers that could not be evicted because the hash lock was ' +
            'held by another thread'
    },
    {
        'kstat_key': 'other_size',
        'key': 'arcstats_other_size_bytes',
        'type': 'gauge',
        'help': 'Bytes consumed by non-ARC buffers'
    },
    {
        'kstat_key': 'overhead_size',
        'key': 'arcstats_overhead_size_bytes',
        'type': 'gauge',
        'help': 'Bytes stored in all arc_buf_t, classifed as overhead since ' +
            'it is typically short-lived.'
    },
    {
        'kstat_key': 'p',
        'key': 'arcstats_p_bytes',
        'type': 'gauge',
        'help': 'Target size of the MRU in bytes'
    },
    {
        'kstat_key': 'prefetch_data_hits',
        'key': 'arcstats_prefetch_data_hits_total',
        'type': 'counter',
        'help': 'ARC prefetch data hits'
    },
    {
        'kstat_key': 'prefetch_data_misses',
        'key': 'arcstats_prefetch_data_misses_total',
        'type': 'counter',
        'help': 'ARC prefetch data misses'
    },
    {
        'kstat_key': 'prefetch_metadata_hits',
        'key': 'arcstats_prefetch_metadata_hits_total',
        'type': 'counter',
        'help': 'ARC prefectch metatdata hits'
    },
    {
        'kstat_key': 'prefetch_metadata_misses',
        'key': 'arcstats_prefetch_metadata_misses_total',
        'type': 'counter',
        'help': 'ARC prefetch metadata misses'
    },
    {
        'kstat_key': 'size',
        'key': 'arcstats_size_bytes',
        'type': 'gauge',
        'help': 'ARC total size in bytes'
    },
    {
        'kstat_key': 'sync_wait_for_async',
        'key': 'arcstats_sync_wait_for_async_total',
        'type': 'counter',
        'help': 'Number of times a sync read waited for an in-progress async ' +
            'read'
    },
    {
        'kstat_key': 'uncompressed_size',
        'key': 'arcstats_uncompressed_size_bytes',
        'type': 'gauge',
        'help': 'ARC total uncompressed size in bytes'
    }
];


function ArcstatMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.kstatReader = opts.kstatReader;
}

ArcstatMetricCollector.prototype.getMetrics =
function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.func(callback, 'callback');

    kstat_common.kstatsToMetrics({
        kstatMap: ARCSTAT_KSTATS,
        kstatReader: self.kstatReader,
        kstatReadOpts: ARCSTAT_READ_OPTS
    }, callback);
};

ArcstatMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (kstat_common.METRIC_TTL);
};

module.exports = ArcstatMetricCollector;
