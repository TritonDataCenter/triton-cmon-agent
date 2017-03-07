/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/* Test the Metric Agent triton-config */
'use strict';

var test = require('tape').test;

var lib_tritonConfig = require('../lib/triton-config');

test('sysinfo succeeds', function _test(t) {
    t.plan(4);

    t.doesNotThrow(function _noThrow() {
        lib_tritonConfig.sysinfo(function _cb(err, sysinfo) {
            t.notOk(err, 'err should not be set');
            t.ok(sysinfo, 'sysinfo should be set');
            t.equal(typeof (sysinfo), 'object', 'sysinfo is object');
            t.end();
        });
    }, 'sysinfo does not throw');
});
