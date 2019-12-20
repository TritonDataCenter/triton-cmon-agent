/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

'use strict';

var zfs2 = require('zfs2');
var mod_assert = require('assert-plus');

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

    zfs2.zfsGet({name: zfsName}, function _processZfsOutput(err, zfsProps) {
        if (err) {
            callback(err);
            return;
        }

        var usageObj = {};
        properties.forEach(function _processZfsProp(prop_name) {
            /*
             * If present chop off the trailing 'x' so that these stats
             * can all be intepreted as Numbers.
             * A trailing 'x' is present in compression ratio properties.
             */
            var value = zfsProps[prop_name].value;
            if (typeof (value) === 'string') {
                value = Number(value.replace(/x$/g, ''));
            }
            mod_assert.number(value, 'usageObj.' + prop_name);
            usageObj[prop_name] = value;
        });

        callback(null, usageObj);
    });
}

module.exports = {
    getZfsUsage: getZfsUsage
};
