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

var forkExecWait = require('forkexec').forkExecWait;

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
    // this collector doesn't need any of the opts
}

ZfsMetricCollector.prototype.getMetrics = function getMetrics(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.vm_uuid, 'opts.vm_uuid');
    mod_assert.func(callback, 'callback');

    var zfsName = 'zones/' + opts.vm_uuid;

    // NOTE: this returns zoneroot info for KVM VMs, not storage used by zvols

    forkExecWait({
        'argv': ['/usr/sbin/zfs', 'list', '-Hp', zfsName]
    }, function _processZfsOutput(err, data) {
        var z;
        var zfsAvail;
        var zfsUsed;

        if (err) {
            callback(err);
            return;
        }

        z = data.stdout.split('\t');

        // TODO: switch to jsprim
        zfsAvail = JSON.parse(JSON.stringify(ZFS_AVAIL_TEMPLATE));
        zfsAvail.value = z[2].toString();
        zfsUsed = JSON.parse(JSON.stringify(ZFS_USED_TEMPLATE));
        zfsUsed.value = z[1].toString();

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
