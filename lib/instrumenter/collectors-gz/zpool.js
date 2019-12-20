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
var mod_vasync = require('vasync');

var kstat_common = require('../lib/kstat-common');

var zfs2 = require('zfs2');

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

/* Invoke the zpool(1M) to collect per-zpool stats. */
ZpoolMetricCollector.prototype.getZpoolStats =
function getZpoolStats(callback) {
    mod_assert.func(callback, 'callback');

    var ret = [];
    var keys = [
        {'key': 'allocated', 'unit': 'bytes' },
        {'key': 'fragmentation', 'unit': 'percent' },
        {'key': 'size', 'unit': 'bytes'}
    ];

    zfs2.zpoolList({}, function _processZpoolList(err, zpoolList) {
        if (err) {
            callback(err, null);
            return;
        }

        mod_assert.arrayOfObject(zpoolList, 'zpoolList');
        zpoolList.forEach(function _processZpoolProps(zpoolProps) {

            var metrics = keys.map(function _createZpoolMetric(key) {
                 mod_assert.object(zpoolProps[key.key],
                     'zpoolProps.' + key.key);

                /*
                 * If present, chop off the trailing '%' sign. This is a bug
                 * in libzfs. the fragmentation field _will_ include a % sign,
                 * but the capacity field will _not_ contain a % sign.
                 */
                var value = zpoolProps[key.key].value;
                value = value.toString().replace(/%$/g, '');

                var metric = {};
                metric.label = '{pool="' + zpoolProps.name.value + '"}';
                metric.key = 'zpool_' + key.key + '_' + key.unit;
                metric.value = value;
                metric.type = 'gauge';
                metric.help = 'zpool list stat: pool ' + key.key + ' ' +
                    key.unit;

                return (metric);
            });

            ret = ret.concat(metrics);
        });

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
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

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
