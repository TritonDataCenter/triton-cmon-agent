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

// var lib_common = require('../common');

var forkExecWait = require('forkexec').forkExecWait;

var GZ_ZONE_ID = 0;

function Gz(reader) {
    mod_assert.object(reader, 'reader');

    var self = this;
    self._reader = reader;
    self._kstatMetrics =
    {
        cpu_info: {},
        arcstats: {}
    };
    self._kstatMetrics.arcstats.misses =
    {
        module: 'zfs',
        kstat_key: 'misses',
        key: 'arcstats_misses_total',
        type: 'counter',
        help: 'ARC misses'
    };
    self._kstatMetrics.cpu_info.brand =
    {
        module: 'cpu_info',
        kstat_key: 'model',
        key: 'cpu_info_model',
        type: 'gauge',
        help: 'CPU model'
    };

    self._timeMetrics = {};
    self._timeMetrics.now =
    {
        date_key: 'now',
        key: 'time_of_day',
        type: 'counter',
        help: 'System time in seconds since epoch'
    };

    self._zfs_misc_arcstatsReadOpts =
    {
        'class': 'misc',
        name: 'arcstats',
        module: 'zfs',
        instance: GZ_ZONE_ID
    };

    self._cpu_info_miscReadOpts =
    {
        'class': 'misc',
        module: 'cpu_info',
        instance: GZ_ZONE_ID
    };
}

function _mapKstats(kstatMetrics, readerData, cb) {
    mod_assert.object(kstatMetrics, 'kstatMetrics');
    mod_assert.object(readerData, 'readerData');

    var mKeys = Object.keys(kstatMetrics);
    for (var i = 0; i < mKeys.length; i++) {
        var metric = kstatMetrics[mKeys[i]];
        if (metric && metric.module) {
            var kstatValue = readerData[metric.kstat_key];
            metric.value = kstatValue;
        } else {
            cb(new Error('Error retrieving kstat value'));
            return;
        }
    }
    cb(null, kstatMetrics);
}

Gz.prototype.getArcKstats = function getArcKstats(cb) {
    var self = this;
    var arcstats = self._reader.read(self._zfs_misc_arcstatsReadOpts)[0];
    _mapKstats(self._kstatMetrics.arcstats, arcstats.data, cb);
};

Gz.prototype.getCpuInfoKstats = function getCpuInfoKstats(cb) {
    var self = this;
    var cpu_info = self._reader.read(self._cpu_info_miscReadOpts)[0];
    _mapKstats(self._kstatMetrics.cpu_info, cpu_info.data, cb);
};

Gz.prototype.getZfsStats = function getZfsStats(cb) {
    var self = this;
    var zfsName = 'zones/' + self._uuid;
    forkExecWait({
        'argv': ['/usr/sbin/zfs', 'list', '-Hp', zfsName]
    }, function _processZfsOutput(err, data) {
        if (err) {
            cb(err, null);
            return;
        }

        var z = data.stdout.split('\t');
        self._zfsMetrics.zfsUsed.value = z[1];
        self._zfsMetrics.zfsAvailable.value = z[2];
        cb(null, self._zfsMetrics);
        return;
    });
};

Gz.prototype.getTimeStats = function getTimeStats(cb) {
    var self = this;
    self._timeMetrics.now.value = Date.now();
    cb(null, self._timeMetrics);
};

module.exports = Gz;
