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
var mod_jsprim = require('jsprim');

var ZFS_AVAIL_TEMPLATE = {
    key: 'zfs_available',
    type: 'gauge',
    help: 'zfs space available in bytes'
};
var ZFS_METRIC_TTL = 300;
var ZFS_USED_TEMPLATE = {
    key: 'zfs_used',
    type: 'gauge',
    help: 'zfs space used in bytes'
};

function ZfsMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.func(opts.getZfsUsage, 'opts.getZfsUsage');

    self.getZfsUsage = opts.getZfsUsage;
}

ZfsMetricCollector.prototype.getMetrics = function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.zonename, 'opts.zonename');
    mod_assert.func(callback, 'callback');

    self.getZfsUsage(opts.zonename, function _gotZfsUsage(err, usage) {
        var zfsAvail;
        var zfsUsed;

        if (err) {
            callback(err);
            return;
        }

        zfsAvail = mod_jsprim.deepCopy(ZFS_AVAIL_TEMPLATE);
        zfsAvail.value = usage.avail.toString();
        zfsUsed = mod_jsprim.deepCopy(ZFS_USED_TEMPLATE);
        zfsUsed.value = usage.used.toString();

        callback(null, [
            zfsAvail,
            zfsUsed
        ]);
        return;
    });
};

ZfsMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (ZFS_METRIC_TTL);
};

module.exports = ZfsMetricCollector;
