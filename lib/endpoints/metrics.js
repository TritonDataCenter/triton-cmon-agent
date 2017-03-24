/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2017 Joyent, Inc.
 */
'use strict';

var mod_assert = require('assert-plus');
var mod_restify = require('restify');

function apiGetMetrics(req, res, next) {
    res.header('content-type', 'text/plain');
    req.app.collector.getMetrics(req.params.container,
        function _sendMetrics(err, strMetrics) {
            if (err) {
                req.app.log.error(err);
                next(new mod_restify.InternalServerError());
            } else if (strMetrics) {
                res.send(strMetrics);
                next();
            } else {
                var strNotFound = 'container not found';
                req.app.log.info({ container: req.params.container },
                    strNotFound);
                next(new mod_restify.NotFoundError(strNotFound));
            }
    });
}

function apiRefreshZoneCache(req, res, next) {
    req.app.collector.refreshZoneCache(
        function _respondToRefresh(err) {
            if (!err) {
                res.send(200);
                next();
            } else {
                var strFail = 'failed to refresh zone cache';
                req.app.log.error(err, strFail);
                next(new mod_restify.InternalServerError(strFail));
            }
    });
}

function mount(opts) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.server, 'opts.server');

    opts.server.get(
        {
            name: 'GetMetricsForContainer',
            path: '/v1/:container/metrics'
        }, apiGetMetrics);

    opts.server.post(
        {
            name: 'InvalidateZoneCache',
            path: '/v1/refresh'
        }, apiRefreshZoneCache);
}

module.exports = {
    mount: mount
};
