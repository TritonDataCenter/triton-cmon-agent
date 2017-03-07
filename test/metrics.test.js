/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/* Test the Metric Agent metrics */
'use strict';

var test = require('tape').test;

var lib_metrics = require('../lib/endpoints/metrics');

/*
 * The success cases are exercised through the app.js tests. Only the
 * failure scenarios are tested here.
 */

test('mount fails with bad or no opts', function _test(t) {
    t.plan(3);

    t.throws(function _noOpts() {
        lib_metrics.mount();
    }, 'opts');

    t.throws(function _noServer() {
        lib_metrics.mount({});
    }, 'opts.server');

    t.throws(function _noApp() {
        lib_metrics.mount({ server: {} });
    }, 'opts.server.app');

    t.end();
});
