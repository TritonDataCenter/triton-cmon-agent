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

var LINK_READ_OPTS = {
    'class': 'net',
    module: 'link'
};

var LINK_KSTATS = [
    {
        kstat_key: 'ipackets64',
        key: 'net_agg_packets_in',
        type: 'counter',
        help: 'Aggregate inbound packets'
    },
    {
        kstat_key: 'obytes64',
        key: 'net_agg_bytes_out',
        type: 'counter',
        help: 'Aggregate outbound bytes'
    },
    {
        kstat_key: 'opackets64',
        key: 'net_agg_packets_out',
        type: 'counter',
        help: 'Aggregate outbound packets'
    },
    {
        kstat_key: 'rbytes64',
        key: 'net_agg_bytes_in',
        type: 'counter',
        help: 'Aggregate inbound bytes'
    }
];


function LinkMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.kstatReader = opts.kstatReader;
}

LinkMetricCollector.prototype.getMetrics = function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.vm_uuid, 'opts.vm_uuid');
    mod_assert.func(callback, 'callback');

    kstat_common.kstatsToMetrics({
        kstatFilter: function _filterLinks(linkKstat) {
            if (linkKstat.data !== undefined &&
                linkKstat.data.zonename === opts.vm_uuid) {

                return true;
            }

            return false;
        },
        kstatMap: LINK_KSTATS,
        kstatReader: self.kstatReader,
        kstatReadOpts: LINK_READ_OPTS
    }, callback);
};

LinkMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (kstat_common.METRIC_TTL);
};

module.exports = LinkMetricCollector;
