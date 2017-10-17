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
var lib_common = require('../../common');

var MEMCAP_READ_OPTS = {
    'class': 'zone_memory_cap',
    instance: '<instanceId>',
    module: 'memory_cap'
};

var MEMCAP_KSTATS = [
    {
        kstat_key: 'rss',
        key: 'mem_agg_usage',
        type: 'gauge',
        help: 'Aggregate memory usage in bytes'
    },
    {
        kstat_key: 'anon_alloc_fail',
        key: 'mem_anon_alloc_fail',
        type: 'counter',
        help: 'Anonymous allocation failure count'
    },
    {
        kstat_key: 'physcap',
        key: 'mem_limit',
        type: 'gauge',
        help: 'Memory limit in bytes',
        modifier: lib_common.memLimit
    },
    {
        kstat_key: 'swap',
        key: 'mem_swap',
        type: 'gauge',
        help: 'Swap in bytes'
    },
    {
        kstat_key: 'swapcap',
        key: 'mem_swap_limit',
        type: 'gauge',
        help: 'Swap limit in bytes',
        modifier: lib_common.memLimit
    }
];


function MemcapMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.kstatReader = opts.kstatReader;
    self.kstatReadOpts = MEMCAP_READ_OPTS;
}

MemcapMetricCollector.prototype.getMetrics =
function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.number(opts.vm_instance, 'opts.vm_instance');
    mod_assert.func(callback, 'callback');

    var readOpts = kstat_common.kstatReadOpts(opts, self.kstatReadOpts);

    kstat_common.kstatsToMetrics({
        kstatMap: MEMCAP_KSTATS,
        kstatReader: self.kstatReader,
        kstatReadOpts: readOpts
    }, callback);
};

MemcapMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (kstat_common.METRIC_TTL);
};

module.exports = MemcapMetricCollector;
