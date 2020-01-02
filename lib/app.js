/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2020, Joyent, Inc.
 */
'use strict';

var mod_assert = require('assert-plus');
var mod_os = require('os');

var mod_restify = require('restify');
var mod_triton_metrics = require('triton-metrics');
var mod_vasync = require('vasync');

var lib_endpointsMetrics = require('./endpoints/metrics');
var lib_instrumenterCollector = require('./instrumenter/collector');

var HOSTNAME = mod_os.hostname();

function App(opts) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.config, 'opts.config');
    mod_assert.string(opts.config.logLevel, 'opts.config.logLevel');
    mod_assert.number(opts.config.port, 'opts.config.port');
    mod_assert.uuid(opts.config.ufdsAdminUuid, 'opts.config.ufdsAdminUuid');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.string(opts.ip, 'opts.ip');
    mod_assert.object(opts.sysinfo, 'opts.sysinfo');
    mod_assert.uuid(opts.sysinfo.UUID, 'opts.sysinfo.UUID');
    mod_assert.string(opts.sysinfo['Datacenter Name'],
        'opts.sysinfo["Datacenter Name"]');

    var self = this;

    self.metricsManager = mod_triton_metrics.createMetricsManager({
        address: opts.ip, // not used, but required
        log: opts.log,
        port: 0, // not used, but required
        /*
         * Even though we're not going to use it, the metricsManager requires
         * us to pass a restify-like thing in so it can pretend to add its
         * handler for 'GET /metrics'. So we create a dummy that does nothing.
         */
        restify: {
            createServer: function _dummyServer() {
                return {
                    get: function _dummyGet() {
                        // do nothing
                    }
                };
            }
        },
        staticLabels: {
            datacenter: opts.sysinfo['Datacenter Name'],
            instance: '0', // this is silly in our case, but required
            server: opts.sysinfo.UUID,
            service: 'cmon-agent'
        }
    });
    self.config = opts.config;
    self.ip = opts.ip;
    self.log = opts.log;
    self.collector = new lib_instrumenterCollector({
        adminUuid: opts.config.ufdsAdminUuid,
        log: self.log,
        metricsManager: self.metricsManager
    });

    var server = self.server = mod_restify.createServer({
        name: 'cmon-agent',
        log: self.log,
        handleUncaughtExceptions: false,
        handleUpgrades: false
    });

    self.metricsManager.createRestifyMetrics();
    server.on('after',
        self.metricsManager.collectRestifyMetrics.bind(self.metricsManager));

    server.use(function basicResReq(req, res, next) {
        res.on('header', function onHeader() {
            var now = Date.now();
            res.header('Date', new Date());
            res.header('Server', server.name);
            res.header('x-request-id', req.getId());
            var t = now - req.time();
            res.header('x-response-time', t);
            res.header('x-server-name', HOSTNAME);
        });

        req.app = self;
        next();
    });

    server.use(mod_restify.gzipResponse());
    server.use(mod_restify.requestLogger());
    server.on('after', function audit(req, res, route, err) {
        // Successful GET res bodies are uninteresting and *big*.
        var body = !(req.method === 'GET' &&
            Math.floor(res.statusCode / 100) === 2);

        mod_restify.auditLogger({
            log: req.log.child({
                route: route && route.name,
                action: req.query.action
            }, true),
            body: body
        })(req, res, route, err);
    });
}

App.prototype.start = function start(cb) {
    var self = this;

    mod_vasync.pipeline({ funcs: [
        function startCollector(_, next) {
            self.collector.start(next);
        },
        function mountRoutes(_, next) {
            lib_endpointsMetrics.mount({server: self.server});
            next();
        }
    ]}, function _pipelineCb(err) {
        if (err) {
            self.log.error(err, 'Fatal: failed to start');
            cb(err);
            return;
        }

        self.server.listen(self.config.port, self.ip, function _listenCb() {
            self.log.info({url: self.server.url}, 'listening');
            cb();
        });
    });
};

App.prototype.close = function close(cb) {
    var self = this;

    self.server.close(function _closedServer() {
        self.collector.stop(function _closedCollector() {
            if (cb) {
                cb();
            }
        });
    });
};

module.exports = App;
