/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/* Test the Metric Agent app */
'use strict';

var test = require('tape').test;

var mod_bunyan = require('bunyan');
var mod_libuuid = require('libuuid');
var mod_restify = require('restify');

var lib_app = require('../lib/app');
var lib_common = require('../lib/common');

var log = mod_bunyan.createLogger({
    level: 'fatal',
    name: 'cmon-agent',
    serializers: mod_restify.bunyan.serializers
});

var DEFAULT_CONFIG = {
    logLevel: 'fatal',
    port: 9090 /* 9090 chosen to not conflict with a running cmon-agent */
};

var DEFAULT_OPTS = { config: DEFAULT_CONFIG, log: log, ip: '127.0.0.1' };

var DEFAULT_ENDPOINT = 'http://' + DEFAULT_OPTS.ip + ':' + DEFAULT_CONFIG.port;

test('create app succeeds', function _test(t) {
    var app;

    t.plan(10);

    t.doesNotThrow(function _createapp() {
        app = new lib_app(DEFAULT_OPTS);
    }, 'app created without error');
    t.ok(app, 'app');

    t.ok(app.config, 'app.config');
    t.deepEqual(app.config, DEFAULT_CONFIG, 'config matches');

    t.ok(app.ip, 'app.ip');
    t.deepEqual(app.ip, DEFAULT_OPTS.ip, 'ip matches');

    t.ok(app.log, 'app.log');
    t.deepEqual(app.log, log, 'log matches');

    t.ok(app.collector, 'app.collector');

    t.ok(app.server, 'app.server');

    t.end();
});

test('create app fails with bad or no opts', function _test(t) {
    var app;

    t.plan(11);

    t.throws(function _noOpts() {
        app = new lib_app();
    }, 'opts');
    t.throws(function _emptyOpts() {
        app = new lib_app({});
    }, 'opts.config');
    t.throws(function _noLogLevel() {
        app = new lib_app({ config: {} });
    }, 'opts.config.logLevel');
    t.throws(function _badLogLevel() {
        app = new lib_app({ config: { logLevel: 1 } });
    }, 'opts.config.logLevel');
    t.throws(function _noPort() {
        app = new lib_app({ config: { logLevel: 'DEBUG' } });
    }, 'opts.config.port');
    t.throws(function _badPort() {
        app = new lib_app({ config: { logLevel: 'DEBUG', port: 'abc' } });
    }, 'opts.config.port');
    t.throws(function _noLog() {
        app = new lib_app({ config: DEFAULT_CONFIG });
    }, 'opts.log');
    t.throws(function _badLog() {
        app = new lib_app({ config: DEFAULT_CONFIG, log: 'log' });
    }, 'opts.log');
    t.throws(function _noIp() {
        app = new lib_app({ config: DEFAULT_CONFIG, log: log });
    }, 'opts.ip');
    t.throws(function _badIp() {
        app = new lib_app({ config: DEFAULT_CONFIG, log: log, ip: 12345 });
    }, 'opts.ip');

    t.notOk(app, 'app was not created');

    t.end();
});

test('start and close app succeeds', function _test(t) {
    var app;

    t.plan(5);

    t.doesNotThrow(function _createApp() {
        app = new lib_app(DEFAULT_OPTS);
    }, 'app created without error');
    t.ok(app, 'app');

    t.doesNotThrow(function _startAndCloseApp() {
        app.start(function _start() {
            t.pass('start function called cb');
            app.close(function _close() {
                t.pass('close function called cb');
                t.end();
            });
        });

    }, 'app start and close called without error');
});

test('http get metrics for zone succeeds', function _test(t) {
    t.plan(6);

    lib_common.fetchRunningZones(function _cb(ferr, zones) {
        t.notOk(ferr, 'ferr is not set');
        t.ok(zones, 'zones is set');
        t.ok(Array.isArray(zones), 'zones is an array');
        t.ok(zones && zones.length && (zones.length > 0), 'zones has elements');

        var metrics_route = '/v1/' + zones[0].uuid + '/metrics';
        var client = mod_restify.createStringClient({ url: DEFAULT_ENDPOINT });

        var app = new lib_app(DEFAULT_OPTS);
        app.start(function _start() {
            setTimeout(function _timeout() {
                client.get(metrics_route, function _get(err, req, res, data) {
                    t.notOk(err, 'err is not set');
                    t.ok(data, 'data is set');
                    app.close(function _close() {
                        t.end();
                    });
                });
            }, 2000);
        });
    });
});

test('http get metrics for missing zone returns 404', function _test(t) {
    t.plan(4);

    var metrics_route = '/v1/' + mod_libuuid.create() + '/metrics';
    var client = mod_restify.createStringClient({ url: DEFAULT_ENDPOINT });

    var app = new lib_app(DEFAULT_OPTS);
    app.start(function _start() {
        setTimeout(function _timeout() {
            client.get(metrics_route, function _get(err, req, res, data) {
                t.ok(err, 'err is set');
                t.equal(err.statusCode, 404, 'error is 404');
                t.ok(data);
                t.equal(data, 'container not found');
                app.close(function _close() {
                    t.end();
                });
            });
        }, 2000);
    });
});

test('http refresh zones succeeds', function _test(t) {
    t.plan(2);

    var refresh_route = '/v1/refresh';
    var client = mod_restify.createStringClient({ url: DEFAULT_ENDPOINT });

    var app = new lib_app(DEFAULT_OPTS);
    app.start(function _start() {
        setTimeout(function _timeout() {
            client.post(refresh_route, function _get(err, req, res, data) {
                t.notOk(err, 'err is not set');
                t.notOk(data, 'data is set');
                app.close(function _close() {
                    t.end();
                });
            });
        }, 2000);
    });
});
