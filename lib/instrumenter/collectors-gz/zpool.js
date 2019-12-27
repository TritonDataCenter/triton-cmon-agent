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
var mod_jsprim = require('jsprim');
var mod_vasync = require('vasync');

var kstat_common = require('../lib/kstat-common');

var forkExecWait = require('forkexec').forkExecWait;
var VError = require('verror').VError;

/*
 * This TTL is mostly arbitrary. 'zpool list' should be pretty quick to execute,
 * even on busy systems.
 */
var ZPOOL_METRIC_TTL = 30;

var METASLAB_GROUP_READ_OPTS = {
    module: 'zfs_metaslab_group',
    'class': 'misc'
};

var ZFS_METASLAB_GROUP_KSTATS = [
    {
        kstat_key: 'loads',
        key: 'metaslab_group_loads',
        type: 'counter',
        help: 'Number of metaslab loads per metaslab group'
    },
    {
        kstat_key: 'unloads',
        key: 'metaslab_group_unloads',
        type: 'counter',
        help: 'Number of metaslab unloads per metaslab group'
    }
];

ZpoolMetricCollector.prototype.getZpoolKstats =
function getZpoolKstats(opts, callback) {
    var self = this;

    var readOpts = kstat_common.kstatReadOpts(opts.zInfo, self.kstatReadOpts);
    kstat_common.kstatsToMetrics({
        kstatMap: ZFS_METASLAB_GROUP_KSTATS,
        kstatReader: self.kstatReader,
        kstatReadOpts: readOpts,
        kstatLabeler: function _labelMetaslabGroup(mgKstat) {
            /*
             * The spa (pool) name and top-level vdev guids are both labels that
             * should be useful to consumers.
             *
             * For example, the consumer could aggregate metaslab load/unload
             * counts per zpool and then drill down further to investigate
             * whether invdividual top-level vdevs are showing more metaslab
             * thrashing than others.
             */
            return ('pool="' + mgKstat.data.spa_name + '",' +
                'vdev_guid="' + mgKstat.name + '"');
        }
    }, callback);
};

/*
 * If present, chop off the trailing '%' sign.
 * This is a bug in the 'zpool' command. Currently when using the '-p'
 * flag the fragmentation field _will_ include a % sign, but the
 * capacity field will _not_ contain a % sign.
 */
function zpoolFragEnc(_collector, x) {
    return x.replace(/%$/g, '');
}

/*
 * Encode zpool health status into a numberic value.
 */
function zpoolHealthEnc(collector, health) {
    mod_assert.object(collector, 'collector');
    mod_assert.object(collector.log, 'collector.log');

    var statusIdx = [
        'ONLINE', 'DEGRADED', 'FAULTED', 'OFFLINE',
        'REMOVED', 'UNAVAIL'
    ].indexOf(health);

    if (statusIdx === -1) {
        collector.log.warn('invalid zpool health status: ' + health);
    }
    return statusIdx.toString();
}

/* Invoke the zpool(1M) to collect per-zpool stats. */
ZpoolMetricCollector.prototype.getZpoolStats =
function getZpoolStats(callback) {
    mod_assert.func(callback, 'callback');
    var keys;
    var lines;
    var metric;
    var metrics;
    var ret = [];
    var self = this;
    var template = {};
    var z;

    keys = [
        {'key': 'allocated', 'unit': 'bytes' },
        {'key': 'fragmentation', 'unit': 'percent', 'encoder': zpoolFragEnc},
        {'key': 'health', 'unit': 'status', 'encoder': zpoolHealthEnc},
        {'key': 'size', 'unit': 'bytes'}
    ];

    forkExecWait({
        'argv': ['/usr/sbin/zpool', 'list', '-Hpo',
        'name,allocated,fragmentation,health,size']
    }, function _processZpoolOutput(err, data) {
        if (err) {
            callback(err, null);
            return;
        }

        lines = data.stdout.split('\n');
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].length === 0) {
                continue;
            }
            z = lines[i].split('\t');

            template.label = '{pool="' + z[0] + '"}';

            /*  We don't need the 'name' field anymore, so chop it off. */
            z.shift();
            if (z.length !== keys.length) {
                callback(new VError({
                    'expected': keys.length,
                    'actual': z.length
                }, 'zpool field mismatch'), null);
                return;
            }

            /*
             * Construct a metric object based on the template for each of the
             * fields we got back from 'zpool list'.
             */
            metrics = keys.map(function _createMetrics(_, ind) {
                mod_assert.object(keys[ind], 'keys[' + ind + ']');
                mod_assert.string(keys[ind].key, 'keys[' + ind + '].key');
                mod_assert.string(keys[ind].unit, 'keys[' + ind + '].unit');

                metric = mod_jsprim.deepCopy(template);
                metric.key = 'zpool_' + keys[ind].key + '_' + keys[ind].unit;
                metric.value = z[ind];

                if (keys[ind].encoder) {
                    metric.value = keys[ind].encoder(self, metric.value);
                }

                metric.type = 'gauge';
                metric.help = 'zpool list stat: pool ' + keys[ind].key + ' ' +
                    keys[ind].unit;

                return (metric);
            });
            ret = ret.concat(metrics);
        }
        callback(null, ret);
    });
};

/*
 * This collector forks out to zpool(1M) in addition to collecting ZFS-related
 * kstats.
 */
function ZpoolMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.log = opts.log;
    self.kstatReader = opts.kstatReader;
    self.kstatReadOpts = METASLAB_GROUP_READ_OPTS;
}

ZpoolMetricCollector.prototype.getMetrics =
function getMetrics(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.zInfo, 'opts.zInfo');
    mod_assert.number(opts.zInfo.instanceId, 'opts.zInfo.instanceId');
    mod_assert.func(callback, 'callback');

    var self = this;

    mod_vasync.pipeline({
        'funcs': [
            function _kstat(_, cb) { self.getZpoolKstats(opts, cb); },
            function _zpool(_, cb) { self.getZpoolStats(cb); }
        ]
    }, function _aggregate_results(err, results) {
        if (err) {
            callback(err, null);
            return;
        }
        var kstat_result = results.successes[0];
        var zpool_result = results.successes[1];
        callback(null, kstat_result.concat(zpool_result));
    });
};

ZpoolMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (ZPOOL_METRIC_TTL);
};

module.exports = ZpoolMetricCollector;
