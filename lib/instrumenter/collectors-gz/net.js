/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

'use strict';
var mod_assert = require('assert-plus');
var kstat_common = require('../lib/kstat-common');

var NET_READ_OPTS = {
    'class': 'net',
    instance: kstat_common.GZ_ZONE_ID
};

var NET_KSTATS = [
    {
        'kstat_key': 'rxsdrops',
        'key': 'net_rxsdrops_total',
        'type': 'counter',
        'help': 'Per software lane rx drops total'
    }
];

function NetMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.kstatReader = opts.kstatReader;
    self.kstatReadOpts = NET_READ_OPTS;
}

NetMetricCollector.prototype.getMetrics =
function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.zInfo, 'opts.zInfo');
    mod_assert.func(callback, 'callback');

    kstat_common.kstatsToMetrics({
        kstatFilter: function _filterNetNames(netKstat) {
            if (netKstat.data !== undefined &&
                netKstat.data.rxsdrops !== undefined) {

                return true;
            }

            return false;
        },
        kstatLabeler: function _labelNetName(netKstat) {
            return ('name=' + netKstat.module + '_' + netKstat.name + '"');
        },
        kstatMap: NET_KSTATS,
        kstatReader: self.kstatReader,
        kstatReadOpts:
            kstat_common.kstatReadOpts(opts.zInfo, self.kstatReadOpts)
    }, callback);
}

NetMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (kstat_common.METRIC_TTL);
}

module.exports = NetMetricCollector;
