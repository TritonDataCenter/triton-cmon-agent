/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 */

'use strict';

var mod_kstat = require('bindings')('kstat');
var mod_bunyan = require('bunyan');
var zpoolGZCollector = require('../lib/instrumenter/collectors-gz/zpool.js');

var test = require('tape').test;

var log = mod_bunyan.createLogger({
    name: 'collector_test',
    level: process.env['LOG_LEVEL'] || 'error',
    stream: process.stderr
});


var kstatReader = new mod_kstat.Reader();
var collector = new zpoolGZCollector({
    log: log,
    kstatReader: kstatReader
});

test('Validate zpool metrics', function _collectZpoolMetrics(t) {
    var opts = {
        zInfo: {
            instanceId: 0,
            zonename: 'gz'
        }
    };

    collector.getMetrics(opts, function _gotZpoolMetrics(err, metrics) {
        if (err) {
            t.end(err);
            return;
        }

        var valid_metric_types = ['counter', 'gauge'];
        var valid_metric_keys = [
            'metaslab_group_loads', 'metaslab_group_unloads',
            'zpool_allocated_bytes', 'zpool_fragmentation_percent',
            'zpool_health_status', 'zpool_size_bytes'
        ];

        // Now we have a metrics, let us inspect them.
        t.ok(Array.isArray(metrics), 'metrics is an array: ' + metrics);
        t.ok(metrics.length, '# of are metrics returned: ' + metrics.length);
        metrics.forEach(function _validteMetric(metric) {
            // Verify that each metric is an object.
            t.ok((typeof (metric) === 'object'),
                'metric is an object' + metric);

            // Verify metric props types
            t.ok((typeof (metric.key) === 'string'),
                'metric key is string: ' + metric.key);
            t.ok((typeof (metric.type) === 'string'),
                'metric type is string: ' + metric.type);
            t.ok((typeof (metric.help) === 'string'),
                'metric help message is string: ' + metric.help);
            t.ok((typeof (metric.value) === 'string'),
                'metric value: is string: ' + metric.value);
            t.ok((typeof (metric.label) === 'string'),
                'metric label: is string: ' + metric.label);

            // Metric values should be numbers
            t.ok(!isNaN(metric.value),
                'metric value is a number: ' + metric.value);

            // Validate metric type
            t.ok(valid_metric_types.indexOf(metric.type) !== -1,
                'valid metric type: ' + metric.type);
            // Validate metric key
            t.ok(valid_metric_keys.indexOf(metric.key) !== -1,
                'valid metric key: ' + metric.key);

        });

        // Verify all metrics have been exported
        valid_metric_keys.forEach(function _checkMetricIsExported(key) {
            var found = metrics.some(function _checkMetric(metric) {
                return metric.key === key;
            });
            t.ok(found, key + ' is exported');
        });

        t.end();
    });
});
