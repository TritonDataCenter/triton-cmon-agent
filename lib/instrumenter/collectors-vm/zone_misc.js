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

var ZONE_MISC_READ_OPTS = {
    'class': 'zone_misc',
    instance: '<instanceId>',
    module: 'zones'
};

var ZONE_MISC_KSTATS = [
    {
        kstat_key: 'nsec_user',
        key: 'cpu_user_usage',
        type: 'counter',
        help: 'User CPU utilization in nanoseconds'
    },
    {
        kstat_key: 'nsec_sys',
        key: 'cpu_sys_usage',
        type: 'counter',
        help: 'System CPU usage in nanoseconds'
    },
    {
        kstat_key: 'nsec_waitrq',
        key: 'cpu_wait_time',
        type: 'counter',
        help: 'CPU wait time in nanoseconds'
    },
    {
        kstat_key: 'avenrun_1min',
        key: 'load_average',
        type: 'gauge',
        help: 'Load average',
        modifier: lib_common.calculateLoadAvg
    }
];


function ZoneMiscMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.kstatReader = opts.kstatReader;
    self.kstatReadOpts = ZONE_MISC_READ_OPTS;
}

ZoneMiscMetricCollector.prototype.getMetrics =
function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.number(opts.instanceId, 'opts.instanceId');
    mod_assert.func(callback, 'callback');

    var zoneMiscReadOpts = kstat_common.kstatReadOpts(opts, self.kstatReadOpts);

    kstat_common.kstatsToMetrics({
        kstatMap: ZONE_MISC_KSTATS,
        kstatReader: self.kstatReader,
        kstatReadOpts: zoneMiscReadOpts
    }, callback);
};

ZoneMiscMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (kstat_common.METRIC_TTL);
};

module.exports = ZoneMiscMetricCollector;
