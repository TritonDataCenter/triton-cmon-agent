/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2019, Joyent, Inc.
 */

'use strict';

var mod_assert = require('assert-plus');
var mod_jsprim = require('jsprim');

var forkExecWait = require('forkexec').forkExecWait;
var VError = require('verror').VError;

/*
 * This TTL is mostly arbitrary. 'zpool list' should be pretty quick to execute,
 * even on busy systems.
 */
var ZPOOL_METRIC_TTL = 30;

function ZpoolMetricCollector() {}

/* Invoke the zpool(1M) to collect per-zpool stats. */
ZpoolMetricCollector.prototype.getZpoolStats =
function getZpoolFragmentation(callback) {
    mod_assert.func(callback, 'callback');
    var keys;
    var lines;
    var metric;
    var metrics;
    var ret = [];
    var template = {};
    var z;

    keys = [
        {'key': 'allocated', 'unit': 'bytes' },
        {'key': 'fragmentation', 'unit': 'percent' },
        {'key': 'size', 'unit': 'bytes'}
    ];

    forkExecWait({
        'argv': ['/usr/sbin/zpool', 'list', '-Hpo',
        'name,allocated,fragmentation,size']
    }, function _processZpoolOutput(err, data) {
        if (err) {
            callback(err, null);
            return;
        }

        /*
         * If present, chop off the trailing '%' sign.
         * This is a bug in the 'zpool' command. Currently when using the '-p'
         * flag the fragmentation field _will_ include a % sign, but the
         * capacity field will _not_ contain a % sign.
         */
        lines = data.stdout.replace(/%/g, '').split('\n');
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
                metric.value = z[ind].trim();
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

ZpoolMetricCollector.prototype.getMetrics =
function getMetrics(_, callback) {
    this.getZpoolStats(callback);
};

ZpoolMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (ZPOOL_METRIC_TTL);
};

module.exports = ZpoolMetricCollector;
