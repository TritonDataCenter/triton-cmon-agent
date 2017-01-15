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
var mod_os = require('os');
var mod_restify = require('restify');
var mod_vasync = require('vasync');

var lib_common = require('./common');
var lib_endpointsMetrics = require('./endpoints/metrics');
var lib_instrumenterCollector = require('./instrumenter/collector');

var HOSTNAME = mod_os.hostname();

function App(opts) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.config, 'opts.config');
    mod_assert.object(opts.log, 'opts.log');

    var self = this;
    self.config = opts.config;
    self.ip = opts.ip;
    self.log = opts.log;
    self.collector = new lib_instrumenterCollector({ log: self.log });
    var server = self.server = mod_restify.createServer({
        name: 'cmon-agent',
        log: self.log,
        handleUpgrades: false
    });

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

    server.use(mod_restify.requestLogger());
    server.on('uncaughtException', lib_common.uncaughtHandler);
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

    mod_vasync.pipeline({ funcs: [
        function mountRoutes(_, next) {
            lib_endpointsMetrics.mount({server: server});
            next();
        }
    ]}, function _pipelineCb(err) {
        if (err) {
            self.log.error(err, 'error starting up');
            process.exit(2);
        }
    });
}

App.prototype.start = function start(cb) {
    var self = this;
    self.server.listen(self.config.port, self.ip, function _listenCb() {
        self.log.info({url: self.server.url}, 'listening');
        cb();
    });
};

App.prototype.close = function close(cb) {
    var self = this;
    self.server.on('close', function _closeEventCb() {
        cb();
    });
    self.server.close();
};

module.exports = App;
