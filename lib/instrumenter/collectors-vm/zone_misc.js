/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

var mod_assert = require('assert-plus');
var mod_jsprim = require('jsprim');

var kstat_common = require('../lib/kstat-common');
var lib_common = require('../../common');

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

var ZONE_MISC_READ_OPTS = {
    'class': 'zone_misc',
    module: 'zones',
    // we'll add instance below
};


function ZoneMiscMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.kstatReader = opts.kstatReader;
}

ZoneMiscMetricCollector.prototype.getMetrics = function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.number(opts.vm_instance, 'opts.instance');
    mod_assert.func(callback, 'callback');

    var zoneMiscReadOpts = mod_jsprim.deepCopy(ZONE_MISC_READ_OPTS);

    zoneMiscReadOpts.instance = opts.vm_instance;

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
