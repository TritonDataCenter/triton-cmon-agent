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

var lib_errors = require('../errors');

function apiGetMetrics(req, res, next) {
    res.header('content-type', 'text/plain');
    req.app.collector.getMetrics(req.params.container,
        function _sendMetrics(err, strMetrics) {
            if (!err) {
                res.send(strMetrics);
                next();
            } else {
                req.app.log.error(err);
                next(new lib_errors.InternalServerError());
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
                req.app.log.error(err);
                next(new lib_errors.InternalServerError());
            }
    });
}

function mount(opts) {
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
