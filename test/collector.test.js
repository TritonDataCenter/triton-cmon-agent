/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/* Test the Metric Agent endpoints */
'use strict';

var test = require('tape').test;

var mod_bunyan = require('bunyan');
var mod_libuuid = require('libuuid');

var lib_instrumenterCollector = require('../lib/instrumenter/collector');

var log = mod_bunyan.createLogger(
    {
        name: 'collector_test',
        level: process.env['LOG_LEVEL'] || 'error',
        stream: process.stderr
    });

test('create collector', function _test(t) {
    t.plan(5);

    var collector;
    t.doesNotThrow(function _create() {
        collector = new lib_instrumenterCollector({ log: log });
    }, 'create instrumenter does not throw an exception');

    t.ok(collector, 'collector is defined');
    t.ok(collector.zones, 'collector.zones is defined');
    t.ok(collector.cache, 'collector.cache is defined');
    t.ok(collector.reader, 'collector.reader is defined');

    t.end();
});

test('create collector fails', function _test(t) {
    t.plan(3);

    var collector;
    t.throws(function _create() {
        collector = new lib_instrumenterCollector();
    }, 'opts');
    t.throws(function _create() {
        collector = new lib_instrumenterCollector({ log: 1 });
    }, 'opts.log');

    t.notOk(collector, 'collector is not defined');

    t.end();
});

test('get metrics', function _test(t) {
    t.plan(78);

    var collector = new lib_instrumenterCollector({ log: log });
    collector.refreshZoneCache(function _refresh(refreshErr) {
        t.notOk(refreshErr, 'refreshErr should be undefined');

        var vm_uuid = Object.keys(collector.zones)[0];
        collector.getMetrics(vm_uuid, function _get(err, str) {
            t.notOk(err, 'err should be undefined');
            t.equal(typeof (str), 'string');
            var metrics = str.split('\n');
            var i = 0;
            while (i < (metrics.length - 2)) {
                t.ok(metrics[i++].startsWith('# HELP '), 'has help metadata');

                t.ok(metrics[i].endsWith(' gauge') ||
                    metrics[i].endsWith(' counter') ||
                    metrics[i].endsWith(' histogram') ||
                    metrics[i].endsWith(' summary'),
                    'ends with a metric type definition');
                t.ok(metrics[i++].startsWith('# TYPE '), 'has type metadata');

                var metric_parts = metrics[i++].split(' ');
                var metric_name = metric_parts[0];
                var metric_value = metric_parts[1];
                t.ok(/^[a-zA-Z_]+$/.test(metric_name), 'metric name is alpha');
                t.ok(Number.isFinite(parseInt(metric_value)) ||
                    Number.isFinite(parseFloat(metric_value)),
                    'metric value is finite');
            }

            t.end();
        });
    });
});

test('get metrics fails', function _test(t) {
    t.plan(4);

    var collector = new lib_instrumenterCollector({ log: log });
    t.throws(function _nonUuid() {
        collector.getMetrics(42, function _noop() {});
    }, 'vm_uuid');
    t.doesNotThrow(function _notExist() {
        var bad_uuid = mod_libuuid.create();
        collector.getMetrics(bad_uuid, function _noop(err, metrics) {
            t.notOk(err, 'err is not set');
            t.notOk(metrics, 'metrics is not set');
        });
    }, 'vm_uuid does not exist in zones');

    t.end();
});

test('refresh zone cache', function _test(t) {
    t.plan(3);

    var collector = new lib_instrumenterCollector({ log: log });
    t.doesNotThrow(function _refresh() {
        collector.refreshZoneCache(function _cb(err) {
            t.notOk(err, 'err is not defined');
            t.ok(collector.zones, 'zones is defined');

            t.end();
        });
    }, 'refresh zones does not throw');
});
