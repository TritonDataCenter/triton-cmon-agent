/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2019 Joyent, Inc.
 */

'use strict';
var mod_assert = require('assert-plus');

var ZFS_METRIC_TTL = 300;

function ZfsMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.func(opts.getZfsUsage, 'opts.getZfsUsage');

    self.getZfsUsage = opts.getZfsUsage;
}

ZfsMetricCollector.prototype.getMetrics = function getMetrics(opts, callback) {
    var self = this;
    var metrics;

    /*
     * This is the mapping of property name to help text.
     *
     * This mapping will need to be updated When the list of properties
     * collected in the getZfsUsage function from
     * cmon-agent/lib/instrumenter/lib/zfs.js is changed.
     */
    var properties = {
        available: 'zfs space available in bytes',
        used: 'zfs space used in bytes',
        logicalused: 'zfs space logically used in bytes',
        recordsize: 'suggested zfs data block size in bytes',
        quota: 'zfs dataset quota in bytes',
        compressratio: 'zfs compression ratio achieved for the used property',
        refcompressratio: 'zfs compression ratio achieved for the' +
            ' referenced property',
        referenced: 'zfs data accessible by dataset in bytes',
        logicalreferenced: 'zfs data logically accessible by dataset in bytes',
        usedbydataset: 'zfs data used by the dataset itself in bytes',
        usedbysnapshots: 'zfs data used by snapshots in bytes'
    };

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.zInfo, 'opts.zInfo');
    mod_assert.uuid(opts.zInfo.zonename, 'opts.zInfo.zonename');
    mod_assert.func(callback, 'callback');

    self.getZfsUsage(opts.zInfo.zonename, function _gotZfsUsage(err, usage) {
        if (err) {
            callback(err);
            return;
        }

        metrics = Object.keys(usage).map(function _createMetric(usage_prop) {
            var metric = {};

            metric.key = 'zfs_' + usage_prop;
            metric.type = 'gauge';
            metric.help = properties[usage_prop];
            metric.value = usage[usage_prop].toString();

            return (metric);
        });

        callback(null, metrics);
        return;
    });
};

ZfsMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (ZFS_METRIC_TTL);
};

module.exports = ZfsMetricCollector;
