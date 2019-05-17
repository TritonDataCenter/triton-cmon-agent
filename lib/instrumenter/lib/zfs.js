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

var forkExecWait = require('forkexec').forkExecWait;

function getZfsUsage(vm_uuid, callback) {
    var zfsName = 'zones/' + vm_uuid;
    /*
     * This list of properties to collect must match the list of properties
     * serialized by getMetrics in the cmon-agent/lib/collectors-vm/zfs.js file.
     */
    var properties = ['available', 'used', 'logicalused', 'recordsize', 'quota',
        'compressratio', 'refcompressratio', 'referenced', 'logicalreferenced',
        'usedbydataset', 'usedbysnapshots'];

    // NOTE: this returns zoneroot info for KVM VMs, not storage used by zvols

    forkExecWait({
        'argv': ['/usr/sbin/zfs', 'list', '-Hpo', properties.join(','), zfsName]
    }, function _processZfsOutput(err, data) {
        var usageObj = {};
        var z;

        if (err) {
            callback(err);
            return;
        }

        /*
         * If present chop off the trailing 'x' so that these stats can all be
         * intepreted as Numbers.
         * A trailing 'x' is present in compression ratio properties.
         */
        z = data.stdout.replace(/x/g, '').split('\t');

        z.forEach(function _processZfsProps(_, index) {
            var prop_name = properties[index];
            usageObj[prop_name] = Number(z[index]);
            mod_assert.number(usageObj[prop_name], 'usageObj.' + prop_name);
        });

        callback(null, usageObj);
        return;
    });
}

module.exports = {
    getZfsUsage: getZfsUsage
};
