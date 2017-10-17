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

function getZfsUsage(vm_uuid, callback) {
    var zfsName = 'zones/' + vm_uuid;

    // NOTE: this returns zoneroot info for KVM VMs, not storage used by zvols

    forkExecWait({
        'argv': ['/usr/sbin/zfs', 'list', '-Hp', zfsName]
    }, function _processZfsOutput(err, data) {
        var usageObj = {};
        var z;

        if (err) {
            callback(err);
            return;
        }

        z = data.stdout.split('\t');

        usageObj.avail = Number(z[2]);
        usageObj.used = Number(z[1]);

        mod_assert.number(usageObj.avail, 'usageObj.avail');
        mod_assert.number(usageObj.used, 'usageObj.used');

        callback(null, usageObj);
        return;
    });
}

module.exports = {
    getZfsUsage: getZfsUsage
};
