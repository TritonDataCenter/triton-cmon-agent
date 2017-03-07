/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/* Test the Metric Agent errors */
'use strict';

var test = require('tape').test;

var lib_errors = require('../lib/errors');

test('Error objects created as expected', function _test(t) {
    t.plan(2);

    var notFoundError = new lib_errors.NotFoundError();
    t.ok(notFoundError, 'NotFoundError created');

    var internalServerError = new lib_errors.InternalServerError();
    t.ok(internalServerError, 'InternalServerError created');

    t.end();
});
