/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

'use strict';
var mod_assert = require('assert-plus');
var kstat_common = require('../lib/kstat-common');


var CPU_UTIL_READ_OPTS = {
    'class': 'misc',
    'module': 'cpu',
    'name': 'sys'
};

function nsec_to_sec(nsec) {
    return (nsec / 1e9);
}

var CPU_UTIL_KSTATS = [
    {
        kstat_key: 'cpu_nsec_idle',
        key: 'cpu_idle_seconds_total',
        type: 'counter',
        help: 'CPU idle time in seconds',
        modifier: nsec_to_sec
    },
    {
        kstat_key: 'cpu_nsec_kernel',
        key: 'cpu_kernel_seconds_total',
        type: 'counter',
        help: 'CPU kernel time in seconds',
        modifier: nsec_to_sec
    },
    {
        kstat_key: 'cpu_nsec_user',
        key: 'cpu_user_seconds_total',
        type: 'counter',
        help: 'CPU user time in seconds',
        modifier: nsec_to_sec
    },
    {
        kstat_key: 'cpu_nsec_dtrace',
        key: 'cpu_dtrace_seconds_total',
        type: 'counter',
        help: 'CPU dtrace time in seconds',
        modifier: nsec_to_sec
    }
];


function CpuUtilizationMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.kstatReader = opts.kstatReader;
    self.kstatReadOpts = CPU_UTIL_READ_OPTS;
}

CpuUtilizationMetricCollector.prototype.getMetrics =
function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.zInfo, 'opts.zInfo');
    mod_assert.func(callback, 'callback');

    kstat_common.kstatsToMetrics({
        kstatMap: CPU_UTIL_KSTATS,
        kstatReader: self.kstatReader,
        kstatReadOpts:
            kstat_common.kstatReadOpts(opts.zInfo, self.kstatReadOpts),
        kstatLabeler: function labeler(obj) {
              return 'cpu_id="' + obj.instance + '"';
        }
    }, callback);
};

CpuUtilizationMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (kstat_common.METRIC_TTL);
};

module.exports = CpuUtilizationMetricCollector;
