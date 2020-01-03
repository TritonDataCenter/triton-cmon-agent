/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
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

var DEFAULT_OPTS = {
    log: log,
    adminUuid: '5e90c035-59ee-4024-8d99-b78314d17638'
};

test('create collector should work with valid opts', function _test(t) {
    t.plan(5);

    var collector;
    t.doesNotThrow(function _create() {
        collector = new lib_instrumenterCollector(DEFAULT_OPTS);
    }, 'create instrumenter does not throw an exception');

    t.ok(collector, 'collector is defined');
    t.ok(collector.zones, 'collector.zones is defined');
    t.ok(collector.cache, 'collector.cache is defined');
    t.ok(collector.reader, 'collector.reader is defined');

    t.end();
});

test('create collector should fail when given invalid opts', function _test(t) {
    t.plan(4);

    var collector;
    t.throws(function _create() {
        collector = new lib_instrumenterCollector();
    }, 'opts');
    t.throws(function _create() {
        collector = new lib_instrumenterCollector({ log: 1 });
    }, 'opts.log');
    t.throws(function _create() {
        collector = new lib_instrumenterCollector({ log: log });
    }, 'opts.adminUuid');

    t.notOk(collector, 'collector is not defined');

    t.end();
});

test('get metrics returns expected metrics for first VM', function _test(t) {
    var collector = new lib_instrumenterCollector(DEFAULT_OPTS);
    collector.start(function _afterStarting() {
        var vm_uuid = collector.reader.read({
            'class': 'zone_misc',
            module: 'zones'
        })[1].data.zonename; // index 0 is GZ

        collector.getMetrics({
            vm_uuid: vm_uuid
        }, function _get(err, str) {
            t.notOk(err, 'err should be undefined');
            t.equal(typeof (str), 'string');
            var metrics = str.split('\n');
            var i = 0;
            while (i < (metrics.length - 2)) {
                t.ok(metrics[i++].startsWith('# HELP '),
                    'has help metadata');

                t.ok(metrics[i].endsWith(' gauge') ||
                    metrics[i].endsWith(' counter') ||
                    metrics[i].endsWith(' histogram') ||
                    metrics[i].endsWith(' summary'),
                    'ends with a metric type definition');
                t.ok(metrics[i++].startsWith('# TYPE '),
                    'has type metadata');

                var metric_parts = metrics[i++].split(' ');
                var metric_name = metric_parts[0];
                var metric_value = metric_parts[1];
                /* BEGIN JSSTYLED */
                t.ok(/^[a-zA-Z0-9_{}=\"\"\-,]+$/.test(metric_name),
                    'metric name contains only name/labels characters, ' +
                    'got: ' + metric_name);
                /* END JSSTYLED */
                t.ok(Number.isFinite(parseInt(metric_value, 10)) ||
                    Number.isFinite(parseFloat(metric_value)),
                    'metric value is finite');
            }

            collector.stop(function _onStop() {
                t.end();
            });
        });
    });
});

test('get metrics fails when passed invalid VM uuid', function _test(t) {
    t.plan(5);

    var collector = new lib_instrumenterCollector(DEFAULT_OPTS);
    collector.start(function _afterStarting() {
        t.throws(function _nonUuid() {
            collector.getMetrics({
                vm_uuid: 42
            }, function _noop() {});
        }, 'vm_uuid');
        t.doesNotThrow(function _notExist() {
            var bad_uuid = mod_libuuid.create();

            collector.getMetrics({
                vm_uuid: bad_uuid
            }, function _noop(err, metrics) {
                t.ok(err, 'err is set');
                t.equal(err.code, 'ENOTFOUND', 'error should be ENOTFOUND');
                t.notOk(metrics, 'metrics is not set');
                collector.stop();
            });
        }, 'vm_uuid does not exist in zones');

        t.end();
    });
});
