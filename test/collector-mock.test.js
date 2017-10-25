/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/* Test the collector/metrics pipeline using mocked system responses. */

'use strict';

var test = require('tape').test;

var mod_libuuid = require('libuuid');
var mod_vasync = require('vasync');

var collector_harness = require('./collector-harness');


test('collectors-common/time works as expected', function _test(t) {
    var expectedMetrics;
    var invalidVmUuid = mod_libuuid.create();
    var mockData = {};
    var sampleTimestamp = 1507171309247;
    var vmUuid = mod_libuuid.create();

    mockData = {
        timestamp: sampleTimestamp,
        vms: {}
    };

    expectedMetrics = [
        '# HELP time_of_day System time in seconds since epoch',
        '# TYPE time_of_day counter',
        'time_of_day ' + sampleTimestamp.toString()
    ];

    // Add a VM (so we can test loading time from this VM and GZ)
    mockData.vms[vmUuid] = {
        instance: 1
    };

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-common': {
                'time': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        mod_vasync.pipeline({
            funcs: [
                function getGzTime(_, cb) {
                    collector.getMetrics('gz',
                        function _gotMetricsCb(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for GZ');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'GZ time metric matches expected');
                        }
                        cb();
                    });
                }, function getVmTime(_, cb) {
                    collector.getMetrics(vmUuid,
                        function _gotMetrics(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for VM');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'VM time metric matches expected');
                        }
                        cb();
                    });
                }, function getInvalidVmTime(_, cb) {
                    collector.getMetrics(invalidVmUuid,
                        function _gotMetrics(err, metrics) {

                        t.ok(err, 'getMetrics should fail for VM');
                        t.equal(err.code, 'ENOTFOUND', 'expected ENOTFOUND');
                        t.equal(metrics, undefined,
                            'expected metrics to be undefined');
                        cb();
                    });
                }
            ]
        }, function pipelineCb(err) {
            t.ifError(err, 'all collectors-common/time checks should succeed');
            collector.stop();
            t.end();
        });
    });
});

test('collectors-gz/arcstats works as expected', function _test(t) {
    var expectedMetrics;
    var mockData = {};

    /* BEGIN JSSTYLED */
    mockData = {
        kstats: [{
            'class': 'misc',
            'module': 'zfs',
            'name': 'arcstats',
            'instance': 0,
            'snaptime': 634373791337876,
            'crtime': 19580159684,
            'data': {
                'hits': 13380586,
                'misses': 254474012,
                'demand_data_hits': 6643181,
                'demand_data_misses': 128106654,
                'demand_metadata_hits': 5832134,
                'demand_metadata_misses': 122432177,
                'prefetch_data_hits': 698131,
                'prefetch_data_misses': 3580450,
                'prefetch_metadata_hits': 207140,
                'prefetch_metadata_misses': 354731,
                'mru_hits': 1573805,
                'mru_ghost_hits': 8621066,
                'mfu_hits': 11332578,
                'mfu_ghost_hits': 21839809,
                'deleted': 128845341,
                'mutex_miss': 491818,
                'evict_skip': 132404948,
                'evict_not_enough': 14645564,
                'evict_l2_cached': 0,
                'evict_l2_eligible': 4712126668800,
                'evict_l2_ineligible': 337252438016,
                'evict_l2_skip': 0,
                'hash_elements': 36874,
                'hash_elements_max': 69958,
                'hash_collisions': 11605254,
                'hash_chains': 624,
                'hash_chain_max': 4,
                'p': 467770662,
                'c': 636296192,
                'c_min': 636296192,
                'c_max': 5090369536,
                'size': 622615608,
                'compressed_size': 173048832,
                'uncompressed_size': 374457856,
                'overhead_size': 316370432,
                'hdr_size': 6895576,
                'data_size': 201933824,
                'metadata_size': 287485440,
                'other_size': 126300768,
                'anon_size': 5148672,
                'anon_evictable_data': 0,
                'anon_evictable_metadata': 0,
                'mru_size': 241807360,
                'mru_evictable_data': 11576320,
                'mru_evictable_metadata': 10240,
                'mru_ghost_size': 383187456,
                'mru_ghost_evictable_data': 64972800,
                'mru_ghost_evictable_metadata': 318214656,
                'mfu_size': 242463232,
                'mfu_evictable_data': 41869312,
                'mfu_evictable_metadata': 1371136,
                'mfu_ghost_size': 243396096,
                'mfu_ghost_evictable_data': 157138432,
                'mfu_ghost_evictable_metadata': 86257664,
                'l2_hits': 0,
                'l2_misses': 0,
                'l2_feeds': 0,
                'l2_rw_clash': 0,
                'l2_read_bytes': 0,
                'l2_write_bytes': 0,
                'l2_writes_sent': 0,
                'l2_writes_done': 0,
                'l2_writes_error': 0,
                'l2_writes_lock_retry': 0,
                'l2_evict_lock_retry': 0,
                'l2_evict_reading': 0,
                'l2_evict_l1cached': 0,
                'l2_free_on_write': 0,
                'l2_abort_lowmem': 0,
                'l2_cksum_bad': 0,
                'l2_io_error': 0,
                'l2_size': 0,
                'l2_asize': 0,
                'l2_hdr_size': 0,
                'memory_throttle_count': 1616598,
                'arc_meta_used': 420681784,
                'arc_meta_limit': 1272592384,
                'arc_meta_max': 474022432,
                'arc_meta_min': 318148096,
                'sync_wait_for_async': 40279,
                'demand_hit_predictive_prefetch': 836127
            }
        }],
        timestamp: Date.now() // doesn't actually matter to this test
    };
    /* BEGIN JSSTYLED */

    /* eslint-disable */
    /* BEGIN JSSTYLED */
    expectedMetrics = [
        '# HELP arcstats_anon_evictable_data_bytes ARC anonymous evictable data',
        '# TYPE arcstats_anon_evictable_data_bytes gauge',
        'arcstats_anon_evictable_data_bytes 0',
        '# HELP arcstats_anon_evictable_metadata_bytes ARC anonymous evictable metadata',
        '# TYPE arcstats_anon_evictable_metadata_bytes gauge',
        'arcstats_anon_evictable_metadata_bytes 0',
        '# HELP arcstats_anon_size_bytes ARC anonymous size',
        '# TYPE arcstats_anon_size_bytes gauge',
        'arcstats_anon_size_bytes 5148672',
        '# HELP arcstats_arc_meta_limit_bytes ARC metadata limit',
        '# TYPE arcstats_arc_meta_limit_bytes gauge',
        'arcstats_arc_meta_limit_bytes 1272592384',
        '# HELP arcstats_arc_meta_max_bytes ARC metadata maximum observed size',
        '# TYPE arcstats_arc_meta_max_bytes gauge',
        'arcstats_arc_meta_max_bytes 474022432',
        '# HELP arcstats_arc_meta_min_bytes ARC metadata minimum',
        '# TYPE arcstats_arc_meta_min_bytes gauge',
        'arcstats_arc_meta_min_bytes 318148096',
        '# HELP arcstats_arc_meta_used_bytes ARC metadata used',
        '# TYPE arcstats_arc_meta_used_bytes gauge',
        'arcstats_arc_meta_used_bytes 420681784',
        '# HELP arcstats_target_cache_size_bytes ARC target cache size',
        '# TYPE arcstats_target_cache_size_bytes gauge',
        'arcstats_target_cache_size_bytes 636296192',
        '# HELP arcstats_max_target_cache_size_bytes ARC maximum target cache size',
        '# TYPE arcstats_max_target_cache_size_bytes gauge',
        'arcstats_max_target_cache_size_bytes 5090369536',
        '# HELP arcstats_min_target_cache_size_bytes ARC minimum target cache size',
        '# TYPE arcstats_min_target_cache_size_bytes gauge',
        'arcstats_min_target_cache_size_bytes 636296192',
        '# HELP arcstats_compressed_size_bytes ARC compressed size',
        '# TYPE arcstats_compressed_size_bytes gauge',
        'arcstats_compressed_size_bytes 173048832',
        '# HELP arcstats_data_size_bytes Number of bytes consumed by ARC buffers backing on disk data',
        '# TYPE arcstats_data_size_bytes gauge',
        'arcstats_data_size_bytes 201933824',
        '# HELP arcstats_demand_data_hits_total ARC demand data hits',
        '# TYPE arcstats_demand_data_hits_total counter',
        'arcstats_demand_data_hits_total 6643181',
        '# HELP arcstats_demand_data_misses_total ARC demand data misses',
        '# TYPE arcstats_demand_data_misses_total counter',
        'arcstats_demand_data_misses_total 128106654',
        '# HELP arcstats_demand_hit_predictive_prefetch_total ARC demand hit predictive prefetch',
        '# TYPE arcstats_demand_hit_predictive_prefetch_total counter',
        'arcstats_demand_hit_predictive_prefetch_total 836127',
        '# HELP arcstats_demand_metadata_hits_total ARC demand metadata hits',
        '# TYPE arcstats_demand_metadata_hits_total counter',
        'arcstats_demand_metadata_hits_total 5832134',
        '# HELP arcstats_demand_metadata_misses_total ARC demand metadata misses',
        '# TYPE arcstats_demand_metadata_misses_total counter',
        'arcstats_demand_metadata_misses_total 122432177',
        '# HELP arcstats_evict_l2_cached_bytes_total ARC L2 cached bytes evicted',
        '# TYPE arcstats_evict_l2_cached_bytes_total counter',
        'arcstats_evict_l2_cached_bytes_total 0',
        '# HELP arcstats_evict_l2_eligible_bytes_total ARC L2 cache bytes eligible for eviction',
        '# TYPE arcstats_evict_l2_eligible_bytes_total counter',
        'arcstats_evict_l2_eligible_bytes_total 4712126668800',
        '# HELP arcstats_evict_l2_ineligible_bytes_total ARC L2 cache bytes ineligible for eviction',
        '# TYPE arcstats_evict_l2_ineligible_bytes_total counter',
        'arcstats_evict_l2_ineligible_bytes_total 337252438016',
        '# HELP arcstats_evict_l2_skip_total ARC L2 cache eviction skips',
        '# TYPE arcstats_evict_l2_skip_total counter',
        'arcstats_evict_l2_skip_total 0',
        '# HELP arcstats_evict_not_enough_total ARC count of eviction scans which did not satisfy ARC_EVICT_ALL',
        '# TYPE arcstats_evict_not_enough_total counter',
        'arcstats_evict_not_enough_total 14645564',
        '# HELP arcstats_evict_skip_total ARC total number of buffers skipped during an eviction',
        '# TYPE arcstats_evict_skip_total counter',
        'arcstats_evict_skip_total 132404948',
        '# HELP arcstats_hash_chain_max ARC hash chain maximum',
        '# TYPE arcstats_hash_chain_max gauge',
        'arcstats_hash_chain_max 4',
        '# HELP arcstats_hash_chains ARC hash chains',
        '# TYPE arcstats_hash_chains gauge',
        'arcstats_hash_chains 624',
        '# HELP arcstats_hash_collisions_total ARC hash collisions',
        '# TYPE arcstats_hash_collisions_total counter',
        'arcstats_hash_collisions_total 11605254',
        '# HELP arcstats_hash_elements ARC hash elements',
        '# TYPE arcstats_hash_elements gauge',
        'arcstats_hash_elements 36874',
        '# HELP arcstats_hash_elements_max ARC hash elements maximum',
        '# TYPE arcstats_hash_elements_max gauge',
        'arcstats_hash_elements_max 69958',
        '# HELP arcstats_hdr_size_bytes Number of bytes consumed by internal ARC structures',
        '# TYPE arcstats_hdr_size_bytes counter',
        'arcstats_hdr_size_bytes 6895576',
        '# HELP arcstats_hits_total ARC hits',
        '# TYPE arcstats_hits_total counter',
        'arcstats_hits_total 13380586',
        '# HELP arcstats_l2_abort_lowmem_total ARC L2 low memory aborts',
        '# TYPE arcstats_l2_abort_lowmem_total counter',
        'arcstats_l2_abort_lowmem_total 0',
        '# HELP arcstats_l2_asize_bytes ARC L2 actual size in bytes after compression',
        '# TYPE arcstats_l2_asize_bytes gauge',
        'arcstats_l2_asize_bytes 0',
        '# HELP arcstats_l2_cksum_bad_total ARC L2 total bad checksums encountered',
        '# TYPE arcstats_l2_cksum_bad_total counter',
        'arcstats_l2_cksum_bad_total 0',
        '# HELP arcstats_l2_evict_l1cached_total ARC L2 evictions which also result in l1 cache evictions',
        '# TYPE arcstats_l2_evict_l1cached_total counter',
        'arcstats_l2_evict_l1cached_total 0',
        '# HELP arcstats_l2_evict_lock_retry_total ARC L2 evictions that fail and retry because of a hash lock miss',
        '# TYPE arcstats_l2_evict_lock_retry_total counter',
        'arcstats_l2_evict_lock_retry_total 0',
        '# HELP arcstats_l2_evict_reading_total ARC L2 eviction of a block that is being or about to be read',
        '# TYPE arcstats_l2_evict_reading_total counter',
        'arcstats_l2_evict_reading_total 0',
        '# HELP arcstats_l2_feeds_total ARC L2 arc feed loop execution count',
        '# TYPE arcstats_l2_feeds_total counter',
        'arcstats_l2_feeds_total 0',
        '# HELP arcstats_l2_free_on_write_total ARC L2 headers added to the free on write list',
        '# TYPE arcstats_l2_free_on_write_total counter',
        'arcstats_l2_free_on_write_total 0',
        '# HELP arcstats_l2_hdr_bytes ARC L2 header bytes',
        '# TYPE arcstats_l2_hdr_bytes gauge',
        'arcstats_l2_hdr_bytes 0',
        '# HELP arcstats_l2_hits_total ARC L2 cache hits',
        '# TYPE arcstats_l2_hits_total counter',
        'arcstats_l2_hits_total 0',
        '# HELP arcstats_l2_io_error_total ARC io error when reading from L2',
        '# TYPE arcstats_l2_io_error_total counter',
        'arcstats_l2_io_error_total 0',
        '# HELP arcstats_l2_misses_total ARC L2 misses',
        '# TYPE arcstats_l2_misses_total counter',
        'arcstats_l2_misses_total 0',
        '# HELP arcstats_l2_read_bytes ARC bytes read from L2',
        '# TYPE arcstats_l2_read_bytes gauge',
        'arcstats_l2_read_bytes 0',
        '# HELP arcstats_l2_rw_clash_total ARC L2 read errors due to active L2 write',
        '# TYPE arcstats_l2_rw_clash_total counter',
        'arcstats_l2_rw_clash_total 0',
        '# HELP arcstats_l2_size_bytes ARC L2 size in bytes',
        '# TYPE arcstats_l2_size_bytes gauge',
        'arcstats_l2_size_bytes 0',
        '# HELP arcstats_l2_write_bytes ARC L2 cummulative bytes written',
        '# TYPE arcstats_l2_write_bytes counter',
        'arcstats_l2_write_bytes 0',
        '# HELP arcstats_l2_writes_done_total ARC L2 cummulative writes done',
        '# TYPE arcstats_l2_writes_done_total counter',
        'arcstats_l2_writes_done_total 0',
        '# HELP arcstats_l2_writes_error_total ARC L2 write errors',
        '# TYPE arcstats_l2_writes_error_total counter',
        'arcstats_l2_writes_error_total 0',
        '# HELP arcstats_l2_writes_lock_retry_total ARC L2 writes which missed the hash lock resulting in a retry',
        '# TYPE arcstats_l2_writes_lock_retry_total counter',
        'arcstats_l2_writes_lock_retry_total 0',
        '# HELP arcstats_l2_writes_sent_total ARC L2 cummulative writes sent',
        '# TYPE arcstats_l2_writes_sent_total counter',
        'arcstats_l2_writes_sent_total 0',
        '# HELP arcstats_memory_throttle_count ARC page load delayed due to low memory',
        '# TYPE arcstats_memory_throttle_count counter',
        'arcstats_memory_throttle_count 1616598',
        '# HELP arcstats_metadata_size_bytes Number of bytes consumed by ARC metadata buffers',
        '# TYPE arcstats_metadata_size_bytes gauge',
        'arcstats_metadata_size_bytes 287485440',
        '# HELP arcstats_mfu_evictable_data_bytes Bytes consumed by ARC data buffers that are evictable',
        '# TYPE arcstats_mfu_evictable_data_bytes gauge',
        'arcstats_mfu_evictable_data_bytes 41869312',
        '# HELP arcstats_mfu_evictable_metadata_bytes Bytes consumed by ARC metadata buffers that are evictable',
        '# TYPE arcstats_mfu_evictable_metadata_bytes gauge',
        'arcstats_mfu_evictable_metadata_bytes 1371136',
        '# HELP arcstats_mfu_ghost_evictable_data Evictable data bytes that would have been consumed by ARC',
        '# TYPE arcstats_mfu_ghost_evictable_data gauge',
        'arcstats_mfu_ghost_evictable_data 157138432',
        '# HELP arcstats_mfu_ghost_evictable_metadata_bytes Evictable metadata bytes that would have been consumed by ARC',
        '# TYPE arcstats_mfu_ghost_evictable_metadata_bytes gauge',
        'arcstats_mfu_ghost_evictable_metadata_bytes 86257664',
        '# HELP arcstats_mfu_ghost_hits_total ARC hits for MFU ghost data (data accessed more than once, but has been evicted from cache)',
        '# TYPE arcstats_mfu_ghost_hits_total counter',
        'arcstats_mfu_ghost_hits_total 21839809',
        '# HELP arcstats_mfu_ghost_size_bytes Evictable bytes that would have been consumed by ARC buffers in the arc_mfu_ghost state',
        '# TYPE arcstats_mfu_ghost_size_bytes gauge',
        'arcstats_mfu_ghost_size_bytes 243396096',
        '# HELP arcstats_mfu_hits_total ARC hits for data in the MFU state',
        '# TYPE arcstats_mfu_hits_total counter',
        'arcstats_mfu_hits_total 11332578',
        '# HELP arcstats_mfu_size_bytes Total number of bytes consumed by ARC buffers in the MFU state',
        '# TYPE arcstats_mfu_size_bytes gauge',
        'arcstats_mfu_size_bytes 242463232',
        '# HELP arcstats_misses_total ARC misses',
        '# TYPE arcstats_misses_total counter',
        'arcstats_misses_total 254474012',
        '# HELP arcstats_mru_evictable_data_bytes Bytes consumed by ARC buffers of type ARC_BUFC_DATA, residing in the arc_mru state, and eligible for eviction',
        '# TYPE arcstats_mru_evictable_data_bytes gauge',
        'arcstats_mru_evictable_data_bytes 11576320',
        '# HELP arcstats_mru_evictable_metadata_bytes Bytes consumed by ARC buffers of type ARC_BUFC_METADATA, residing in the arc_mru state, and eligible for eviction',
        '# TYPE arcstats_mru_evictable_metadata_bytes gauge',
        'arcstats_mru_evictable_metadata_bytes 10240',
        '# HELP arcstats_mru_ghost_evictable_data_bytes Bytes that would have been consumed by ARC buffers and of type ARC_BUFC_DATA, and linked off the arc_mru_ghost state',
        '# TYPE arcstats_mru_ghost_evictable_data_bytes gauge',
        'arcstats_mru_ghost_evictable_data_bytes 64972800',
        '# HELP arcstats_mru_ghost_evictable_metadata_bytes Bytes that would have been consumed by ARC buffers and of type ARC_BUFC_METADATA, and linked off the arc_mru_ghost state',
        '# TYPE arcstats_mru_ghost_evictable_metadata_bytes gauge',
        'arcstats_mru_ghost_evictable_metadata_bytes 318214656',
        '# HELP arcstats_mru_ghost_hits_total ARC hits for MRU ghost data (data accessed recently, but has been evicted from cache)',
        '# TYPE arcstats_mru_ghost_hits_total counter',
        'arcstats_mru_ghost_hits_total 8621066',
        '# HELP arcstats_mru_ghost_size_bytes Total bytes that would have been consumed by ARC buffers in the arc_mru_ghost state. (This is not DRAM consumption)',
        '# TYPE arcstats_mru_ghost_size_bytes gauge',
        'arcstats_mru_ghost_size_bytes 383187456',
        '# HELP arcstats_mru_hits_total Total MRU hits',
        '# TYPE arcstats_mru_hits_total counter',
        'arcstats_mru_hits_total 1573805',
        '# HELP arcstats_mru_size_bytes Total number of bytes consumed by ARC buffers in the arc_mru state',
        '# TYPE arcstats_mru_size_bytes gauge',
        'arcstats_mru_size_bytes 241807360',
        '# HELP arcstats_mutex_miss_total Buffers that could not be evicted because the hash lock was held by another thread',
        '# TYPE arcstats_mutex_miss_total counter',
        'arcstats_mutex_miss_total 491818',
        '# HELP arcstats_other_size_bytes Bytes consumed by non-ARC buffers',
        '# TYPE arcstats_other_size_bytes gauge',
        'arcstats_other_size_bytes 126300768',
        '# HELP arcstats_overhead_size_bytes Bytes stored in all arc_buf_t, classifed as overhead since it is typically short-lived.',
        '# TYPE arcstats_overhead_size_bytes gauge',
        'arcstats_overhead_size_bytes 316370432',
        '# HELP arcstats_p_bytes Target size of the MRU in bytes',
        '# TYPE arcstats_p_bytes gauge',
        'arcstats_p_bytes 467770662',
        '# HELP arcstats_prefetch_data_hits_total ARC prefetch data hits',
        '# TYPE arcstats_prefetch_data_hits_total counter',
        'arcstats_prefetch_data_hits_total 698131',
        '# HELP arcstats_prefetch_data_misses_total ARC prefetch data misses',
        '# TYPE arcstats_prefetch_data_misses_total counter',
        'arcstats_prefetch_data_misses_total 3580450',
        '# HELP arcstats_prefetch_metadata_hits_total ARC prefectch metatdata hits',
        '# TYPE arcstats_prefetch_metadata_hits_total counter',
        'arcstats_prefetch_metadata_hits_total 207140',
        '# HELP arcstats_prefetch_metadata_misses_total ARC prefetch metadata misses',
        '# TYPE arcstats_prefetch_metadata_misses_total counter',
        'arcstats_prefetch_metadata_misses_total 354731',
        '# HELP arcstats_size_bytes ARC total size in bytes',
        '# TYPE arcstats_size_bytes gauge',
        'arcstats_size_bytes 622615608',
        '# HELP arcstats_sync_wait_for_async_total Number of times a sync read waited for an in-progress async read',
        '# TYPE arcstats_sync_wait_for_async_total counter',
        'arcstats_sync_wait_for_async_total 40279',
        '# HELP arcstats_uncompressed_size_bytes ARC total uncompressed size in bytes',
        '# TYPE arcstats_uncompressed_size_bytes gauge',
        'arcstats_uncompressed_size_bytes 374457856'
    ];
    /* END JSSTYLED */
    /* eslint-enable */

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-gz': {
                'arcstats': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        mod_vasync.pipeline({
            funcs: [
                function getGzArcstats(_, cb) {
                    collector.getMetrics('gz',
                        function _gotMetrics(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for GZ');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'GZ arcstat metrics match expected');
                        }
                        cb();
                    });
                }
            ]
        }, function pipelineCb(err) {
            t.ifError(err, 'all collectors-gz/arcstat checks should succeed');
            collector.stop();
            t.end();
        });
    });
});

test('collectors-gz/cpu_info works as expected', function _test(t) {
    var expectedMetrics;
    var mockData = {};

    /* eslint-disable */
    /* BEGIN JSSTYLED */
    mockData = {
        kstats: [{
            'class': 'misc',
            'module': 'cpu_info',
            'name': 'cpu_info0',
            'instance': 0,
            'snaptime': 650146324978010,
            'crtime': 17524434008,
            'data': {
                'state': 111,
                'state_begin': 1506822711,
                'cpu_type': 105,
                'fpu_type': 105,
                'clock_MHz': 2900,
                'chip_id': 0,
                'implementation': 'x86 (chipid 0x0 GenuineIntel 906E9 family 6 model 158 step 9 clock 2900 MHz)',
                'brand': 'Intel(r) Core(tm) i7-7820HQ CPU @ 2.90GHz',
                'core_id': 0,
                'current_clock_Hz': 2903568230,
                'supported_frequencies_Hz': '2903568230',
                'pg_id': -1,
                'vendor_id': 'GenuineIntel',
                'family': 6,
                'model': 158,
                'stepping': 9,
                'clog_id': 0,
                'pkg_core_id': 0,
                'ncpu_per_chip': 1,
                'ncore_per_chip': 1,
                'supported_max_cstates': 1,
                'current_cstate': 0,
                'cache_id': 0,
                'socket_type': 'Unknown'
            }
        }],
        timestamp: Date.now() // doesn't actually matter to this test
    };
    /* END JSSTYLED */
    /* eslint-enable */

    expectedMetrics = [
        '# HELP cpu_info_model CPU model',
        '# TYPE cpu_info_model gauge',
        'cpu_info_model 158'
    ];

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-gz': {
                'cpu_info': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        collector.getMetrics('gz', function _gotMetrics(err, metrics) {
            t.ifError(err, 'getMetrics should succeed for GZ');
            if (!err) {
                t.deepEqual(metrics.trim().split('\n'),
                    expectedMetrics,
                    'GZ cpu_info metrics match expected');
            }
            collector.stop();
            t.end();
        });
    });
});

test('collectors-vm/link works as expected w/ 2 vnics', function _test(t) {
    var expectedMetrics;
    var mockData = {};

    // NOTE: link lookup relies on zonename so we want to throw in a few extra
    // links from both other zones and the GZ to ensure the lookup filters the
    // correct ones out.
    mockData = {
        'kstats': [
            {
                'class': 'net',
                'module': 'link',
                'name': 'e1000g0',
                'instance': 0,
                'snaptime': 651262941571361,
                'crtime': 22098900946,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 0,
                    'multixmt': 0,
                    'brdcstxmt': 0,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 458859817,
                    'ipackets': 2575739,
                    'obytes': 314682218,
                    'opackets': 2672913,
                    'rbytes64': 458859817,
                    'ipackets64': 2575739,
                    'obytes64': 314682218,
                    'opackets64': 2672913,
                    'link_state': 1,
                    'link_duplex': 2,
                    'unknowns': 243132,
                    'zonename': 'global'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'e1000g1',
                'instance': 0,
                'snaptime': 651262941897866,
                'crtime': 22447205155,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 0,
                    'multixmt': 0,
                    'brdcstxmt': 0,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 410852672,
                    'ipackets': 3884732,
                    'obytes': 1699057793,
                    'opackets': 8852869,
                    'rbytes64': 410852672,
                    'ipackets64': 3884732,
                    'obytes64': 1699057793,
                    'opackets64': 8852869,
                    'link_state': 1,
                    'link_duplex': 2,
                    'unknowns': 135504,
                    'zonename': 'global'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'external0',
                'instance': 0,
                'snaptime': 651262941946599,
                'crtime': 50918301393,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 21190,
                    'brdcstrcv': 232868,
                    'multixmt': 10279,
                    'brdcstxmt': 10279,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 51536376,
                    'ipackets': 303128,
                    'obytes': 2607845,
                    'opackets': 40173,
                    'rbytes64': 51536376,
                    'ipackets64': 303128,
                    'obytes64': 2607845,
                    'opackets64': 40173,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 0,
                    'zonename': 'global'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'sdc_underlay0',
                'instance': 0,
                'snaptime': 651262941980244,
                'crtime': 50987567906,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 21190,
                    'brdcstrcv': 240961,
                    'multixmt': 2186,
                    'brdcstxmt': 2186,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 16242321,
                    'ipackets': 262151,
                    'obytes': 92608,
                    'opackets': 2189,
                    'rbytes64': 16242321,
                    'ipackets64': 262151,
                    'obytes64': 92608,
                    'opackets64': 2189,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 0,
                    'zonename': 'global'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'z24_net0',
                'instance': 0,
                'snaptime': 651262942731096,
                'crtime': 92671002022,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 4880569,
                    'multixmt': 151511,
                    'brdcstxmt': 151511,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 360616500,
                    'ipackets': 6348522,
                    'obytes': 204461637,
                    'opackets': 1696748,
                    'rbytes64': 360616500,
                    'ipackets64': 6348522,
                    'obytes64': 204461637,
                    'opackets64': 1696748,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 11456,
                    'zonename': 'f0b7e8d8-8f76-46db-b292-6d8124212ea1'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'z23_net0',
                'instance': 0,
                'snaptime': 651262942762504,
                'crtime': 92780606144,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 4811969,
                    'multixmt': 220092,
                    'brdcstxmt': 220092,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 578287768,
                    'ipackets': 7630876,
                    'obytes': 396762037,
                    'opackets': 3528626,
                    'rbytes64': 578287768,
                    'ipackets64': 7630876,
                    'obytes64': 396762037,
                    'opackets64': 3528626,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 2457,
                    'zonename': 'ed8b1ed3-cc47-46ff-92a9-e028132f7446'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'z26_net0',
                'instance': 0,
                'snaptime': 651262942797909,
                'crtime': 92802991285,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 4929320,
                    'multixmt': 102766,
                    'brdcstxmt': 102766,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 551194436,
                    'ipackets': 8942538,
                    'obytes': 386700874,
                    'opackets': 5029565,
                    'rbytes64': 551194436,
                    'ipackets64': 8942538,
                    'obytes64': 386700874,
                    'opackets64': 5029565,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 1,
                    'zonename': '61c64afd-6c69-44b3-94fc-bcd17234e268'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'z26_net1',
                'instance': 0,
                'snaptime': 651262942821565,
                'crtime': 92854924814,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 240245,
                    'multixmt': 2870,
                    'brdcstxmt': 2870,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 15497110,
                    'ipackets': 244580,
                    'obytes': 418432,
                    'opackets': 6215,
                    'rbytes64': 15497110,
                    'ipackets64': 244580,
                    'obytes64': 418432,
                    'opackets64': 6215,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 0,
                    'zonename': '61c64afd-6c69-44b3-94fc-bcd17234e268'
                }
            }
        ],
        'timestamp': 1507474725964,
        'vms': {
            '61c64afd-6c69-44b3-94fc-bcd17234e268': {
                'instance': 26,
                'zfs': {
                    'avail': 18268170752,
                    'used': 17743360
                }
            }
        }
    };

    expectedMetrics = [
        '# HELP net_agg_packets_in Aggregate inbound packets',
        '# TYPE net_agg_packets_in counter',
        'net_agg_packets_in{interface="vnic0"} 8942538',
        '# HELP net_agg_bytes_out Aggregate outbound bytes',
        '# TYPE net_agg_bytes_out counter',
        'net_agg_bytes_out{interface="vnic0"} 386700874',
        '# HELP net_agg_packets_out Aggregate outbound packets',
        '# TYPE net_agg_packets_out counter',
        'net_agg_packets_out{interface="vnic0"} 5029565',
        '# HELP net_agg_bytes_in Aggregate inbound bytes',
        '# TYPE net_agg_bytes_in counter',
        'net_agg_bytes_in{interface="vnic0"} 551194436',
        'net_agg_packets_in{interface="vnic1"} 244580',
        'net_agg_bytes_out{interface="vnic1"} 418432',
        'net_agg_packets_out{interface="vnic1"} 6215',
        'net_agg_bytes_in{interface="vnic1"} 15497110'
    ];

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-vm': {
                'link': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        mod_vasync.pipeline({
            funcs: [
                function getStats(_, cb) {
                    collector.getMetrics('61c64afd-6c69-44b3-94fc-bcd17234e268',
                        function _gotMetrics(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for VM');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'VM link metrics match expected');
                        }
                        cb();
                    });
                }
            ]
        }, function pipelineCb(err) {
            t.ifError(err,
                'all collectors-vm/link checks should succeed w/ 2 vnics');
            collector.stop();
            t.end();
        });
    });
});

test('collectors-vm/link works as expected w/ 1 vnic', function _test(t) {
    var expectedMetrics;
    var mockData = {};

    // NOTE: link lookup relies on zonename so we want to throw in a few extra
    // links from both other zones and the GZ to ensure the lookup filters the
    // correct ones out.
    mockData = {
        'kstats': [
            {
                'class': 'net',
                'module': 'link',
                'name': 'e1000g0',
                'instance': 0,
                'snaptime': 651262941571361,
                'crtime': 22098900946,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 0,
                    'multixmt': 0,
                    'brdcstxmt': 0,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 458859817,
                    'ipackets': 2575739,
                    'obytes': 314682218,
                    'opackets': 2672913,
                    'rbytes64': 458859817,
                    'ipackets64': 2575739,
                    'obytes64': 314682218,
                    'opackets64': 2672913,
                    'link_state': 1,
                    'link_duplex': 2,
                    'unknowns': 243132,
                    'zonename': 'global'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'e1000g1',
                'instance': 0,
                'snaptime': 651262941897866,
                'crtime': 22447205155,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 0,
                    'multixmt': 0,
                    'brdcstxmt': 0,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 410852672,
                    'ipackets': 3884732,
                    'obytes': 1699057793,
                    'opackets': 8852869,
                    'rbytes64': 410852672,
                    'ipackets64': 3884732,
                    'obytes64': 1699057793,
                    'opackets64': 8852869,
                    'link_state': 1,
                    'link_duplex': 2,
                    'unknowns': 135504,
                    'zonename': 'global'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'external0',
                'instance': 0,
                'snaptime': 651262941946599,
                'crtime': 50918301393,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 21190,
                    'brdcstrcv': 232868,
                    'multixmt': 10279,
                    'brdcstxmt': 10279,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 51536376,
                    'ipackets': 303128,
                    'obytes': 2607845,
                    'opackets': 40173,
                    'rbytes64': 51536376,
                    'ipackets64': 303128,
                    'obytes64': 2607845,
                    'opackets64': 40173,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 0,
                    'zonename': 'global'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'sdc_underlay0',
                'instance': 0,
                'snaptime': 651262941980244,
                'crtime': 50987567906,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 21190,
                    'brdcstrcv': 240961,
                    'multixmt': 2186,
                    'brdcstxmt': 2186,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 16242321,
                    'ipackets': 262151,
                    'obytes': 92608,
                    'opackets': 2189,
                    'rbytes64': 16242321,
                    'ipackets64': 262151,
                    'obytes64': 92608,
                    'opackets64': 2189,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 0,
                    'zonename': 'global'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'z24_net0',
                'instance': 0,
                'snaptime': 651262942731096,
                'crtime': 92671002022,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 4880569,
                    'multixmt': 151511,
                    'brdcstxmt': 151511,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 360616500,
                    'ipackets': 6348522,
                    'obytes': 204461637,
                    'opackets': 1696748,
                    'rbytes64': 360616500,
                    'ipackets64': 6348522,
                    'obytes64': 204461637,
                    'opackets64': 1696748,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 11456,
                    'zonename': 'f0b7e8d8-8f76-46db-b292-6d8124212ea1'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'z23_net0',
                'instance': 0,
                'snaptime': 651262942762504,
                'crtime': 92780606144,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 4811969,
                    'multixmt': 220092,
                    'brdcstxmt': 220092,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 578287768,
                    'ipackets': 7630876,
                    'obytes': 396762037,
                    'opackets': 3528626,
                    'rbytes64': 578287768,
                    'ipackets64': 7630876,
                    'obytes64': 396762037,
                    'opackets64': 3528626,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 2457,
                    'zonename': 'ed8b1ed3-cc47-46ff-92a9-e028132f7446'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'z26_net0',
                'instance': 0,
                'snaptime': 651262942797909,
                'crtime': 92802991285,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 4929320,
                    'multixmt': 102766,
                    'brdcstxmt': 102766,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 551194436,
                    'ipackets': 8942538,
                    'obytes': 386700874,
                    'opackets': 5029565,
                    'rbytes64': 551194436,
                    'ipackets64': 8942538,
                    'obytes64': 386700874,
                    'opackets64': 5029565,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 1,
                    'zonename': '61c64afd-6c69-44b3-94fc-bcd17234e268'
                }
            },
            {
                'class': 'net',
                'module': 'link',
                'name': 'z26_net1',
                'instance': 0,
                'snaptime': 651262942821565,
                'crtime': 92854924814,
                'data': {
                    'ifspeed': 1000000000,
                    'multircv': 0,
                    'brdcstrcv': 240245,
                    'multixmt': 2870,
                    'brdcstxmt': 2870,
                    'norcvbuf': 0,
                    'ierrors': 0,
                    'noxmtbuf': 0,
                    'oerrors': 0,
                    'collisions': 0,
                    'rbytes': 15497110,
                    'ipackets': 244580,
                    'obytes': 418432,
                    'opackets': 6215,
                    'rbytes64': 15497110,
                    'ipackets64': 244580,
                    'obytes64': 418432,
                    'opackets64': 6215,
                    'link_state': 1,
                    'link_duplex': 0,
                    'unknowns': 0,
                    'zonename': '61c64afd-6c69-44b3-94fc-bcd17234e268'
                }
            }
        ],
        'timestamp': 1507474725964,
        'vms': {
            'f0b7e8d8-8f76-46db-b292-6d8124212ea1': {
                'instance': 24,
                'zfs': {
                    'avail': 18263131648,
                    'used': 6315520
                }
            }
        }
    };

    expectedMetrics = [
        '# HELP net_agg_packets_in Aggregate inbound packets',
        '# TYPE net_agg_packets_in counter',
        'net_agg_packets_in{interface="vnic0"} 6348522',
        '# HELP net_agg_bytes_out Aggregate outbound bytes',
        '# TYPE net_agg_bytes_out counter',
        'net_agg_bytes_out{interface="vnic0"} 204461637',
        '# HELP net_agg_packets_out Aggregate outbound packets',
        '# TYPE net_agg_packets_out counter',
        'net_agg_packets_out{interface="vnic0"} 1696748',
        '# HELP net_agg_bytes_in Aggregate inbound bytes',
        '# TYPE net_agg_bytes_in counter',
        'net_agg_bytes_in{interface="vnic0"} 360616500'
    ];

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-vm': {
                'link': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        mod_vasync.pipeline({
            funcs: [
                function getStats(_, cb) {
                    collector.getMetrics('f0b7e8d8-8f76-46db-b292-6d8124212ea1',
                        function _gotMetrics(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for VM');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'VM link metrics match expected');
                        }
                        cb();
                    });
                }
            ]
        }, function pipelineCb(err) {
            t.ifError(err,
                'all collectors-vm/link checks should succeed w/ 1 vnic');
            collector.stop();
            t.end();
        });
    });
});

test('collectors-vm/memcap works as expected', function _test(t) {
    var expectedMetrics;
    var mockData = {};

    mockData = {
        'kstats': [
            {
                'class': 'zone_memory_cap',
                'module': 'memory_cap',
                'name': 'b55cf19c-4898-4bd1-9169-b89b47',
                'instance': 4,
                'snaptime': 652623688123957,
                'crtime': 81459655739,
                'data': {
                    'zonename': 'b55cf19c-4898-4bd1-9169-b89b472d0621',
                    'rss': 324755456,
                    'physcap': 2147483648,
                    'swap': 1764012032,
                    'swapcap': 4294967296,
                    'nover': 0,
                    'pagedout': 0,
                    'pgpgin': 6963475,
                    'anonpgin': 3923924,
                    'execpgin': 212273,
                    'fspgin': 2827278,
                    'anon_alloc_fail': 0,
                    'n_pf_throttle': 0,
                    'n_pf_throttle_usec': 0
                }
            }
        ],
        'timestamp': 1507476086699,
        'vms': {
            'b55cf19c-4898-4bd1-9169-b89b472d0621': {
                'instance': 4,
                'zfs': {
                    'avail': 18258729472,
                    'used': 845639680
                }
            }
        }
    };

    expectedMetrics = [
        '# HELP mem_agg_usage Aggregate memory usage in bytes',
        '# TYPE mem_agg_usage gauge',
        'mem_agg_usage 324755456',
        '# HELP mem_anon_alloc_fail Anonymous allocation failure count',
        '# TYPE mem_anon_alloc_fail counter',
        'mem_anon_alloc_fail 0',
        '# HELP mem_limit Memory limit in bytes',
        '# TYPE mem_limit gauge',
        'mem_limit 2147483648',
        '# HELP mem_swap Swap in bytes',
        '# TYPE mem_swap gauge',
        'mem_swap 1764012032',
        '# HELP mem_swap_limit Swap limit in bytes',
        '# TYPE mem_swap_limit gauge',
        'mem_swap_limit 4294967296'
    ];

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-vm': {
                'memcap': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        mod_vasync.pipeline({
            funcs: [
                function getStats(_, cb) {
                    collector.getMetrics('b55cf19c-4898-4bd1-9169-b89b472d0621',
                        function _gotMetrics(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for VM');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'VM memcap metrics match expected');
                        }
                        cb();
                    });
                }
            ]
        }, function pipelineCb(err) {
            t.ifError(err,
                'all collectors-vm/memcap checks should succeed');
            collector.stop();
            t.end();
        });
    });
});

test('collectors-vm/tcp works as expected', function _test(t) {
    var expectedMetrics;
    var mockData = {};

    mockData = {
        'kstats': [
            {
                'class': 'mib2',
                'module': 'tcp',
                'name': 'tcp',
                'instance': 5,
                'snaptime': 652927120084339,
                'crtime': 81617557027,
                'data': {
                    'rtoAlgorithm': 4,
                    'rtoMin': 400,
                    'rtoMax': 60000,
                    'maxConn': -1,
                    'activeOpens': 272214,
                    'passiveOpens': 265510,
                    'attemptFails': 39,
                    'estabResets': 7,
                    'currEstab': 411,
                    'inSegs': 14927854,
                    'outSegs': 2996665,
                    'retransSegs': 2745,
                    'connTableSize': 68,
                    'outRsts': 45,
                    'outDataSegs': 49666644,
                    'outDataBytes': 429306305,
                    'retransBytes': 3724908,
                    'outAck': 9407306,
                    'outAckDelayed': 4983798,
                    'outUrg': 0,
                    'outWinUpdate': 0,
                    'outWinProbe': 0,
                    'outControl': 1075036,
                    'outFastRetrans': 0,
                    'inAckSegs': 0,
                    'inAckBytes': 1294904276,
                    'inDupAck': 1742322,
                    'inAckUnsent': 0,
                    'inDataInorderSegs': 47665364,
                    'inDataInorderBytes': 767967287,
                    'inDataUnorderSegs': 500,
                    'inDataUnorderBytes': 583087,
                    'inDataDupSegs': 1462343,
                    'inDataDupBytes': 1544277,
                    'inDataPartDupSegs': 0,
                    'inDataPartDupBytes': 0,
                    'inDataPastWinSegs': 0,
                    'inDataPastWinBytes': 0,
                    'inWinProbe': 0,
                    'inWinUpdate': 0,
                    'inClosed': 6,
                    'rttUpdate': 0,
                    'rttNoUpdate': 34776764,
                    'timRetrans': 318,
                    'timRetransDrop': 0,
                    'timKeepalive': 2591,
                    'timKeepaliveProbe': 0,
                    'timKeepaliveDrop': 0,
                    'listenDrop': 0,
                    'listenDropQ0': 0,
                    'halfOpenDrop': 0,
                    'outSackRetransSegs': 1808,
                    'connTableSize6': 96
                }
            }
        ],
        'timestamp': 1507476390091,
        'vms': {
            'ddda3938-eca5-4a03-b7b2-2fe79b5b2dd1': {
                'instance': 5,
                'zfs': {
                    'avail': 18255816704,
                    'used': 120608768
                }
            }
        }
    };

    /* eslint-disable */
    /* BEGIN JSSTYLED */
    expectedMetrics = [
        '# HELP tcp_failed_connection_attempt_count Failed TCP connection attempts',
        '# TYPE tcp_failed_connection_attempt_count counter',
        'tcp_failed_connection_attempt_count 39',
        '# HELP tcp_retransmitted_segment_count Retransmitted TCP segments',
        '# TYPE tcp_retransmitted_segment_count counter',
        'tcp_retransmitted_segment_count 2745',
        '# HELP tcp_duplicate_ack_count Duplicate TCP ACK count',
        '# TYPE tcp_duplicate_ack_count counter',
        'tcp_duplicate_ack_count 1742322',
        '# HELP tcp_listen_drop_count TCP listen drops. Connection refused because backlog full',
        '# TYPE tcp_listen_drop_count counter',
        'tcp_listen_drop_count 0',
        '# HELP tcp_listen_drop_Qzero_count Total # of connections refused due to half-open queue (q0) full',
        '# TYPE tcp_listen_drop_Qzero_count counter',
        'tcp_listen_drop_Qzero_count 0',
        '# HELP tcp_half_open_drop_count TCP connection dropped from a full half-open queue',
        '# TYPE tcp_half_open_drop_count counter',
        'tcp_half_open_drop_count 0',
        '# HELP tcp_retransmit_timeout_drop_count TCP connection dropped due to retransmit timeout',
        '# TYPE tcp_retransmit_timeout_drop_count counter',
        'tcp_retransmit_timeout_drop_count 0',
        '# HELP tcp_active_open_count TCP active open connections',
        '# TYPE tcp_active_open_count counter',
        'tcp_active_open_count 272214',
        '# HELP tcp_passive_open_count TCP passive open connections',
        '# TYPE tcp_passive_open_count counter',
        'tcp_passive_open_count 265510',
        '# HELP tcp_current_established_connections_total TCP total established connections',
        '# TYPE tcp_current_established_connections_total gauge',
        'tcp_current_established_connections_total 411'
    ];
    /* END JSSTYLED */
    /* eslint-enable */

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-vm': {
                'tcp': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        mod_vasync.pipeline({
            funcs: [
                function getStats(_, cb) {
                    collector.getMetrics('ddda3938-eca5-4a03-b7b2-2fe79b5b2dd1',
                        function _gotMetrics(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for VM');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'VM tcp metrics match expected');
                        }
                        cb();
                    });
                }
            ]
        }, function pipelineCb(err) {
            t.ifError(err,
                'all collectors-vm/tcp checks should succeed');
            collector.stop();
            t.end();
        });
    });
});

test('collectors-vm/zfs works as expected', function _test(t) {
    var expectedMetrics;
    var mockData = {};

    mockData = {
        'timestamp': 1507476390091,
        'vms': {
            '319cb666-4797-4387-83ed-56d865fd25f4': {
                'instance': 14,
                'zfs': {
                    'avail': 18244200960,
                    'used': 3231139328
                }
            }
        }
    };

    expectedMetrics = [
        '# HELP zfs_available zfs space available in bytes',
        '# TYPE zfs_available gauge',
        'zfs_available 18244200960',
        '# HELP zfs_used zfs space used in bytes',
        '# TYPE zfs_used gauge',
        'zfs_used 3231139328'
    ];

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-vm': {
                'zfs': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        mod_vasync.pipeline({
            funcs: [
                function getStats(_, cb) {
                    collector.getMetrics('319cb666-4797-4387-83ed-56d865fd25f4',
                        function _gotMetrics(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for VM');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'VM zfs metrics match expected');
                        }
                        cb();
                    });
                }
            ]
        }, function pipelineCb(err) {
            t.ifError(err,
                'all collectors-vm/zfs checks should succeed');
            collector.stop();
            t.end();
        });
    });
});

test('collectors-vm/zone_misc works as expected', function _test(t) {
    var expectedMetrics;
    var mockData = {};

    mockData = {
        'kstats': [
            {
                'class': 'zone_misc',
                'module': 'zones',
                'name': '319cb666-4797-4387-83ed-56d865',
                'instance': 14,
                'snaptime': 656595920119216,
                'crtime': 83370393591,
                'data': {
                    'zonename': '319cb666-4797-4387-83ed-56d865fd25f4',
                    'nsec_user': 382258003486,
                    'nsec_sys': 175294007074,
                    'nsec_waitrq': 3149676934738,
                    'avenrun_1min': 0,
                    'avenrun_5min': 0,
                    'avenrun_15min': 0,
                    'forkfail_cap': 0,
                    'forkfail_noproc': 0,
                    'forkfail_nomem': 0,
                    'forkfail_misc': 0,
                    'mapfail_seglim': 0,
                    'nested_interp': 0,
                    'init_pid': 5229,
                    'boot_time': 1506822780
                }
            }
        ],
        'timestamp': 1507476390091,
        'vms': {
            '319cb666-4797-4387-83ed-56d865fd25f4': {
                'instance': 14,
                'zone_mis': {
                    'avail': 18244200960,
                    'used': 3231139328
                }
            }
        }
    };

    expectedMetrics = [
        '# HELP cpu_user_usage User CPU utilization in nanoseconds',
        '# TYPE cpu_user_usage counter',
        'cpu_user_usage 382258003486',
        '# HELP cpu_sys_usage System CPU usage in nanoseconds',
        '# TYPE cpu_sys_usage counter',
        'cpu_sys_usage 175294007074',
        '# HELP cpu_wait_time CPU wait time in nanoseconds',
        '# TYPE cpu_wait_time counter',
        'cpu_wait_time 3149676934738',
        '# HELP load_average Load average',
        '# TYPE load_average gauge',
        'load_average 0'
    ];

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-vm': {
                'zone_misc': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        mod_vasync.pipeline({
            funcs: [
                function getStats(_, cb) {
                    collector.getMetrics('319cb666-4797-4387-83ed-56d865fd25f4',
                        function _gotMetrics(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for VM');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'VM zone_misc metrics match expected');
                        }
                        cb();
                    });
                }
            ]
        }, function pipelineCb(err) {
            t.ifError(err,
                'all collectors-vm/zone_misc checks should succeed');
            collector.stop();
            t.end();
        });
    });
});

test('collectors-vm/zone_vfs works as expected', function _test(t) {
    var expectedMetrics;
    var mockData = {};

    mockData = {
        'kstats': [
            {
                'class': 'zone_vfs',
                'module': 'zone_vfs',
                'name': '319cb666-4797-4387-83ed-56d865',
                'instance': 14,
                'snaptime': 656595920233066,
                'crtime': 83370348732,
                'data': {
                    'zonename': '319cb666-4797-4387-83ed-56d865fd25f4',
                    'nread': 106467672,
                    'reads': 2808720,
                    'rtime': 41205058480,
                    'rlentime': 44287888294,
                    'rcnt': 0,
                    'nwritten': 16612520,
                    'writes': 21455,
                    'wtime': 12561929432,
                    'wlentime': 12588270335,
                    'wcnt': 0,
                    '10ms_ops': 733,
                    '100ms_ops': 69,
                    '1s_ops': 0,
                    '10s_ops': 0,
                    'delay_cnt': 12869,
                    'delay_time': 76340
                }
            }
        ],
        'timestamp': 1507476390091,
        'vms': {
            '319cb666-4797-4387-83ed-56d865fd25f4': {
                'instance': 14,
                'zone_mis': {
                    'avail': 18244200960,
                    'used': 3231139328
                }
            }
        }
    };

    /* eslint-disable */
    /* BEGIN JSSTYLED */
    expectedMetrics = [
        '# HELP vfs_bytes_read_count VFS number of bytes read',
        '# TYPE vfs_bytes_read_count counter',
        'vfs_bytes_read_count 106467672',
        '# HELP vfs_bytes_written_count VFS number of bytes written',
        '# TYPE vfs_bytes_written_count counter',
        'vfs_bytes_written_count 16612520',
        '# HELP vfs_read_operation_count VFS number of read operations',
        '# TYPE vfs_read_operation_count counter',
        'vfs_read_operation_count 2808720',
        '# HELP vfs_write_operation_count VFS number of write operations',
        '# TYPE vfs_write_operation_count counter',
        'vfs_write_operation_count 21455',
        '# HELP vfs_wait_time_count VFS cumulative wait (pre-service) time',
        '# TYPE vfs_wait_time_count counter',
        'vfs_wait_time_count 12561929432',
        '# HELP vfs_wait_length_time_count VFS cumulative wait length*time product',
        '# TYPE vfs_wait_length_time_count counter',
        'vfs_wait_length_time_count 12588270335',
        '# HELP vfs_run_time_count VFS cumulative run (pre-service) time',
        '# TYPE vfs_run_time_count counter',
        'vfs_run_time_count 41205058480',
        '# HELP vfs_run_length_time_count VFS cumulative run length*time product',
        '# TYPE vfs_run_length_time_count counter',
        'vfs_run_length_time_count 12588270335',
        '# HELP vfs_elements_wait_state VFS number of elements in wait state',
        '# TYPE vfs_elements_wait_state gauge',
        'vfs_elements_wait_state 0',
        '# HELP vfs_elements_run_state VFS number of elements in run state',
        '# TYPE vfs_elements_run_state gauge',
        'vfs_elements_run_state 0'
    ];
    /* END JSSTYLED */
    /* eslint-enable */

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-vm': {
                'zone_vfs': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        mod_vasync.pipeline({
            funcs: [
                function getStats(_, cb) {
                    collector.getMetrics('319cb666-4797-4387-83ed-56d865fd25f4',
                        function _gotMetrics(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for VM');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'VM zone_vfs metrics match expected');
                        }
                        cb();
                    });
                }
            ]
        }, function pipelineCb(err) {
            t.ifError(err,
                'all collectors-vm/zone_vfs checks should succeed');
            collector.stop();
            t.end();
        });
    });
});

test('collectors-vm/cpucap works as expected w/ capped zone',
function _test(t) {
    var expectedMetrics;
    var mockData = {};

    mockData = {
        'timestamp': 1507667772042,
        'kstats': [
            {
                'class': 'zone_caps',
                'module': 'caps',
                'name': 'cpucaps_zone_5',
                'instance': 5,
                'snaptime': 812973962481910,
                'crtime': 81612233297,
                'data': {
                    'value': 400,
                    'baseline': 321,
                    'effective': 400,
                    'burst_limit_sec': 0,
                    'bursting_sec': 0,
                    'usage': 1,
                    'nwait': 0,
                    'below_sec': 812427,
                    'above_sec': 0,
                    'above_base_sec': 0,
                    'maxusage': 89,
                    'zonename': 'ddda3938-eca5-4a03-b7b2-2fe79b5b2dd1'
                }
            }
        ],
        'vms': {
            'ddda3938-eca5-4a03-b7b2-2fe79b5b2dd1': {
                'instance': 5,
                'zfs': {
                    'avail': 17877601280,
                    'used': 120375808
                }
            }
        }
    };

    /* eslint-disable */
    /* BEGIN JSSTYLED */
    expectedMetrics = [
        '# HELP cpucap_above_base_seconds_total Time (in seconds) a zone has spent over the baseline',
        '# TYPE cpucap_above_base_seconds_total counter',
        'cpucap_above_base_seconds_total 0',
        '# HELP cpucap_above_seconds_total Time (in seconds) a zone has spent over its cpu_cap',
        '# TYPE cpucap_above_seconds_total counter',
        'cpucap_above_seconds_total 0',
        '# HELP cpucap_baseline_percentage The "normal" CPU utilization expected for a zone with this cpu_cap (percentage of a single CPU)',
        '# TYPE cpucap_baseline_percentage gauge',
        'cpucap_baseline_percentage 321',
        '# HELP cpucap_below_seconds_total Time (in seconds) a zone has spent under its cpu_cap',
        '# TYPE cpucap_below_seconds_total counter',
        'cpucap_below_seconds_total 812427',
        '# HELP cpucap_burst_limit_seconds The limit on the number of seconds a zone can burst over its cpu_cap before the effective cap is lowered to the baseline',
        '# TYPE cpucap_burst_limit_seconds gauge',
        'cpucap_burst_limit_seconds 0',
        '# HELP cpucap_effective_percentage Shows which cap is being used, the baseline value or the burst value',
        '# TYPE cpucap_effective_percentage gauge',
        'cpucap_effective_percentage 400',
        '# HELP cpucap_max_usage_percentage The highest CPU utilization the zone has seen since booting (percentage of a single CPU)',
        '# TYPE cpucap_max_usage_percentage gauge',
        'cpucap_max_usage_percentage 89',
        '# HELP cpucap_waiting_threads_count The number of threads put on the wait queue due to the zone being over its cap',
        '# TYPE cpucap_waiting_threads_count gauge',
        'cpucap_waiting_threads_count 0',
        '# HELP cpucap_cur_usage_percentage Current CPU utilization of the zone (percentage of a single CPU)',
        '# TYPE cpucap_cur_usage_percentage gauge',
        'cpucap_cur_usage_percentage 1',
        '# HELP cpucap_limit_percentage The cpu_cap limit (percentage of a single CPU)',
        '# TYPE cpucap_limit_percentage gauge',
        'cpucap_limit_percentage 400'
    ];
    /* END JSSTYLED */
    /* eslint-enable */

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-vm': {
                'cpucap': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        mod_vasync.pipeline({
            funcs: [
                function getStats(_, cb) {
                    collector.getMetrics('ddda3938-eca5-4a03-b7b2-2fe79b5b2dd1',
                        function _gotMetrics(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for VM');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'VM cpucap metrics match expected');
                        }
                        cb();
                    });
                }
            ]
        }, function pipelineCb(err) {
            t.ifError(err,
                'all collectors-vm/cpucap checks should succeed');
            collector.stop();
            t.end();
        });
    });
});

test('collectors-vm/cpucap works as expected w/ uncapped zone',
function _test(t) {
    var expectedMetrics;
    var mockData = {};

    mockData = {
        'timestamp': 1507669124075,
        'kstats': [
        ],
        'vms': {
            '5831aa14-bcf3-4e72-a0b9-1847e80b08e7': {
                'instance': 28,
                'zfs': {
                    'avail': 17866666496,
                    'used': 166888448
                }
            }
        }
    };

    expectedMetrics = [
        ''
    ];

    collector_harness.createCollector({
        enabledCollectors: {
            'collectors-vm': {
                'cpucap': true
            }
        }, mockData: mockData
    }, function _collectorCreatedCb(collector) {
        mod_vasync.pipeline({
            funcs: [
                function getStats(_, cb) {
                    collector.getMetrics('5831aa14-bcf3-4e72-a0b9-1847e80b08e7',
                        function _gotMetrics(err, metrics) {

                        t.ifError(err, 'getMetrics should succeed for VM');
                        if (!err) {
                            t.deepEqual(metrics.trim().split('\n'),
                                expectedMetrics,
                                'VM cpucap metrics match expected');
                        }
                        cb();
                    });
                }
            ]
        }, function pipelineCb(err) {
            t.ifError(err,
                'all collectors-vm/cpucap checks should succeed');
            collector.stop();
            t.end();
        });
    });
});
