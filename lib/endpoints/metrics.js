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
            var strNotFound = 'container not found';

            if (err) {
                if (err.code === 'ENOTFOUND') {
                    req.app.log.info({ container: req.params.container },
                        strNotFound);
                    next(new mod_restify.NotFoundError(strNotFound));
                } else {
                    req.app.log.error(err);
                    next(new mod_restify.InternalServerError());
                }
                return;
            }

            // ensure we got a string if we didn't have an error
            mod_assert.string(strMetrics, 'strMetrics');

            res.send(strMetrics);
            next();
        });
}

function apiRefreshZoneCache(req, res, next) {
    /*
     * We don't actually have a zone cache any more. This does nothing and can
     * be removed once we've determined it no longer needs to be in the API for
     * compatibility reasons.
     */
    res.send(200);
    next();
}

function mount(opts) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.server, 'opts.server');

    opts.server.get(
        {
            name: 'GetMetrics',
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
