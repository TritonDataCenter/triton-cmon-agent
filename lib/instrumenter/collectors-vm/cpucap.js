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

var CPUCAP_READ_OPTS = {
    'class': 'zone_caps',
    instance: '<instanceId>',
    module: 'caps',
    name: 'cpucaps_zone_<instanceId>'
};

var CPUCAP_KSTATS = [
    {
        kstat_key: 'above_base_sec',
        key: 'cpucap_above_base_seconds_total',
        type: 'counter',
        help: 'Time (in seconds) a zone has spent over the baseline'
    },
    {
        kstat_key: 'above_sec',
        key: 'cpucap_above_seconds_total',
        type: 'counter',
        help: 'Time (in seconds) a zone has spent over its cpu_cap'
    },
    {
        kstat_key: 'baseline',
        key: 'cpucap_baseline_percentage',
        type: 'gauge',
        help: 'The "normal" CPU utilization expected for a zone with this ' +
            'cpu_cap (percentage of a single CPU)'
    },
    {
        kstat_key: 'below_sec',
        key: 'cpucap_below_seconds_total',
        type: 'counter',
        help: 'Time (in seconds) a zone has spent under its cpu_cap'
    },
    {
        kstat_key: 'burst_limit_sec',
        key: 'cpucap_burst_limit_seconds',
        type: 'gauge',
        help: 'The limit on the number of seconds a zone can burst over its ' +
            'cpu_cap before the effective cap is lowered to the baseline'
    },
    {
        kstat_key: 'effective',
        key: 'cpucap_effective_percentage',
        type: 'gauge',
        help: 'Shows which cap is being used, the baseline value or the ' +
            'burst value'
    },
    {
        kstat_key: 'maxusage',
        key: 'cpucap_max_usage_percentage',
        type: 'gauge',
        help: 'The highest CPU utilization the zone has seen since booting ' +
            '(percentage of a single CPU)'
    },
    {
        kstat_key: 'nwait',
        key: 'cpucap_waiting_threads_count',
        type: 'gauge',
        help: 'The number of threads put on the wait queue due to the zone ' +
            'being over its cap'
    },
    {
        kstat_key: 'usage',
        key: 'cpucap_cur_usage_percentage',
        type: 'gauge',
        help: 'Current CPU utilization of the zone (percentage of a single CPU)'
    },
    {
        kstat_key: 'value',
        key: 'cpucap_limit_percentage',
        type: 'gauge',
        help: 'The cpu_cap limit (percentage of a single CPU)'
    }
];


function CpucapMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.kstatReader = opts.kstatReader;
    self.kstatReadOpts = CPUCAP_READ_OPTS;

    // Give callers a way to tell that it's ok when this collector returns empty
    // results. This is true for this collector because VMs without cpu_caps
    // will have no 'cpucaps_zone_<instanceId>' kstats.
    self.EMPTY_OK = true;
}

CpucapMetricCollector.prototype.getMetrics =
function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.number(opts.instanceId, 'opts.instanceId');
    mod_assert.func(callback, 'callback');

    var readOpts = kstat_common.kstatReadOpts(opts, self.kstatReadOpts);

    kstat_common.kstatsToMetrics({
        kstatMap: CPUCAP_KSTATS,
        kstatReader: self.kstatReader,
        kstatReadOpts: readOpts
    }, callback);
};

CpucapMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (kstat_common.METRIC_TTL);
};

module.exports = CpucapMetricCollector;
