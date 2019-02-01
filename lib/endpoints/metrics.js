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
var mod_restify = require('restify');

// Must match value in triton-cmon/lib/endpoints/metrics.js
var CMON_OPTS_HEADER = 'x-joyent-cmon-opts';

function apiGetMetrics(req, res, next) {
    res.header('content-type', 'text/plain');

    var collector = req.app.collector;
    var vm_uuid = req.params.container;

    getCoreZoneStatus({
        collector: collector,
        headers: req.headers,
        log: req.app.log,
        vm_uuid: vm_uuid
    }, function _gotIsCore(err, isCoreZone) {
        if (err) {
            req.app.log.error(err);
            next(err);
            return;
        }

        collector.getMetrics({
            vm_uuid: vm_uuid,
            isCoreZone: isCoreZone
        }, function _sendMetrics(subErr, strMetrics) {
            var strNotFound = 'container not found';

            if (subErr) {
                if (subErr.code === 'ENOTFOUND') {
                    req.app.log.info({ container: req.params.container },
                        strNotFound);
                    next(new mod_restify.NotFoundError(strNotFound));
                } else {
                    req.app.log.error(subErr);
                    next(new mod_restify.InternalServerError());
                }
                return;
            }

            // ensure we got a string if we didn't have an error
            mod_assert.string(strMetrics, 'strMetrics');

            res.send(strMetrics);
            next();
        });
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

/*
 * getCoreZoneStatus returns a bool with the value `true` if the zone in
 * question is a core Joyent application zone, and false otherwise.
 *
 * This function will identify core Triton and Manta zones when receiving
 * requests from cmon version >= 1.6.0, but only core Triton zones otherwise.
 *
 * If the getMetrics request came from cmon version >= 1.6.0, the request
 * will have a header that indicates whether the zone is a core zone. In this
 * case, we simply parse and return the header value, which will be `true` if
 * the zone is a core Triton _or Manta_ zone.
 *
 * Requests from cmon versions < 1.6.0 will not contain this header, so we must
 * load the zone data and check if it is a core zone. In this case, we emulate
 * the behavior of cmon-agent < 1.11.0, which means we only identify core
 * _Triton_ zones. Manta zones will _not_ be identified in this case.
 */
function getCoreZoneStatus(opts, callback) {
    mod_assert.object(opts.collector, 'opts.collector');
    mod_assert.object(opts.headers, 'opts.headers');
    mod_assert.object(opts.log, 'opts.log');

    // vm_uuid must be either a uuid or the string 'gz'
    if (opts.vm_uuid !== 'gz') {
        mod_assert.uuid(opts.vm_uuid, 'opts.vm_uuid');
    }

    var headerStr = opts.headers[CMON_OPTS_HEADER];
    // Parse the header, if it exists
    if (headerStr) {
        try {
            // Convert base64 header string into javascript object
            var jsonStr = Buffer.from(headerStr, 'base64').toString('utf8');
            var headerObj = JSON.parse(jsonStr);
            mod_assert.bool(headerObj.isCoreZone, 'headerObj.isCoreZone');
            callback(null, headerObj.isCoreZone);
            return;
        } catch (err) {
            var strBadObj = 'Error parsing ' + CMON_OPTS_HEADER + ' header';
            callback(new mod_restify.BadRequestError(err, strBadObj), null);
            return;
        }
    } else {
        // The header does not exist: load the zone metadata to get isCoreZone.
        opts.collector.getTritonMetadata({
            adminUuid: opts.collector.adminUuid,
            cache: opts.collector.cache,
            coreZoneConfirmed: false,
            log: opts.log,
            vmUuid: opts.vm_uuid
        }, function _gotMetadata(err, vm) {
            if (err) {
                callback(err, null);
                return;
            }
            callback(null, vm.isCoreZone);
        });
    }
}

module.exports = {
    mount: mount,
    CMON_OPTS_HEADER: CMON_OPTS_HEADER
};
