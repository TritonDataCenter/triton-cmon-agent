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

var TCP_READ_OPTS = {
    'class': 'mib2',
    instance: '<instanceId>',
    module: 'tcp'
};

var TCP_KSTATS = [
    {
        kstat_key: 'attemptFails',
        key: 'tcp_failed_connection_attempt_count',
        type: 'counter',
        help: 'Failed TCP connection attempts'
    },
    {
        kstat_key: 'retransSegs',
        key: 'tcp_retransmitted_segment_count',
        type: 'counter',
        help: 'Retransmitted TCP segments'
    },
    {
        kstat_key: 'inDupAck',
        key: 'tcp_duplicate_ack_count',
        type: 'counter',
        help: 'Duplicate TCP ACK count'
    },
    {
        kstat_key: 'listenDrop',
        key: 'tcp_listen_drop_count',
        type: 'counter',
        help: 'TCP listen drops. Connection refused because backlog full'
    },
    {
        kstat_key: 'listenDropQ0',
        key: 'tcp_listen_drop_Qzero_count',
        type: 'counter',
        help: 'Total # of connections refused due to half-open queue (q0) full'
    },
    {
        kstat_key: 'halfOpenDrop',
        key: 'tcp_half_open_drop_count',
        type: 'counter',
        help: 'TCP connection dropped from a full half-open queue'
    },
    {
        kstat_key: 'timRetransDrop',
        key: 'tcp_retransmit_timeout_drop_count',
        type: 'counter',
        help: 'TCP connection dropped due to retransmit timeout'
    },
    {
        kstat_key: 'activeOpens',
        key: 'tcp_active_open_count',
        type: 'counter',
        help: 'TCP active open connections'
    },
    {
        kstat_key: 'passiveOpens',
        key: 'tcp_passive_open_count',
        type: 'counter',
        help: 'TCP passive open connections'
    },
    {
        kstat_key: 'currEstab',
        key: 'tcp_current_established_connections_total',
        type: 'gauge',
        help: 'TCP total established connections'
    }
];

function TcpMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.kstatReader = opts.kstatReader;
    self.kstatReadOpts = TCP_READ_OPTS;
}

TcpMetricCollector.prototype.getMetrics = function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.number(opts.vm_instance, 'opts.vm_instance');
    mod_assert.func(callback, 'callback');

    var tcpReadOpts = kstat_common.kstatReadOpts(opts, self.kstatReadOpts);

    kstat_common.kstatsToMetrics({
        kstatMap: TCP_KSTATS,
        kstatReader: self.kstatReader,
        kstatReadOpts: tcpReadOpts
    }, callback);
};

TcpMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (kstat_common.METRIC_TTL);
};

module.exports = TcpMetricCollector;
