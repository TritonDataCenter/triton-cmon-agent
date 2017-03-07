/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/* Test the Metric Agent common */
'use strict';

var test = require('tape').test;

var lib_common = require('../lib/common');

var FSCALE = 256; /* derived from sys/param.h */

test('caclulateLoadAvg fails with bad data', function _test(t) {
    t.plan(4);

    var loadAvg;

    t.throws(function _noValue() {
        loadAvg = lib_common.calculateLoadAvg();
    }, 'kstat must be an integer');

    t.throws(function _strValue() {
        loadAvg = lib_common.calculateLoadAvg('1');
    }, 'kstat must be an integer');

    t.throws(function _nonIntValue() {
        loadAvg = lib_common.calculateLoadAvg(1.1);
    }, 'kstat must be an integer');

    t.notOk(loadAvg, 'no load average calculated');

    t.end();
});

test('calculateLoadAvg succeeds', function _test(t) {
    t.plan(3);

    t.doesNotThrow(function _calc() {
        var genericValue = 63;
        var loadAvg = lib_common.calculateLoadAvg(genericValue);
        t.ok(loadAvg, 'loadAvg returned');
        t.equal(loadAvg, (genericValue / FSCALE), 'correct loadAvg');
    }, 'calculated without error');

    t.end();
});

test('memLimit fails with bad data', function _test(t) {
    t.plan(4);

    var stat;

    t.throws(function _noValue() {
        stat = lib_common.memLimit();
    }, 'value must be an integer');

    t.throws(function _strValue() {
        stat = lib_common.memLimit('1');
    }, 'value must be an integer');

    t.throws(function _nonIntValue() {
        stat = lib_common.memLimit(1.1);
    }, 'value must be an integer');

    t.notOk(stat, 'no stat returned');

    t.end();
});

test('memLimit succeeds', function _test(t) {
    t.plan(4);

    t.doesNotThrow(function _calc() {
        var zero = 0;
        var twoToTheSixtyFour = Math.pow(2, 64);
        var genericValue = 63;
        var stat;

        stat = lib_common.memLimit(zero);
        t.notOk(stat, '0 results in undefined');

        stat = lib_common.memLimit(twoToTheSixtyFour);
        t.notOk(stat, '2^64 results in undefined');

        stat = lib_common.memLimit(genericValue);
        t.equal(stat, genericValue, 'valid value returned');
    }, 'returned without error');

    t.end();
});

test('fetchRunningZones returns zones', function _test(t) {
    t.plan(4);

    t.doesNotThrow(function _fetch() {
        lib_common.fetchRunningZones(function _cb(err, zones) {
            t.notOk(err, 'no error');
            t.ok(zones, 'zones');
            t.ok(Array.isArray(zones), 'zones is an array');
            t.end();
        });
    }, 'fetchRunningZones does not throw');

});
