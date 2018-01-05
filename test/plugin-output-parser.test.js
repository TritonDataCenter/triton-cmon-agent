/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/* Test the plugin collector's output parser */
'use strict';

var mod_bunyan = require('bunyan');
var test = require('tape').test;

var lib_output_parser = require('../lib/plugin-output-parser');

var log = mod_bunyan.createLogger({
    level: 'fatal',
    name: 'plugin-output-parser-test'
});

test('parser should be able to parse simple metric', function _test(t) {
    var parser;
    var opts = {
        log: log
    };

    parser = new lib_output_parser(opts);

    parser.parse({
        prefix: 'test_prefix_',
        output: 'number\tgauge\t42\tthe number'
    }, function _onParse(err, metrics) {
        t.ifError(err, 'parser should parse simple metric');
        t.deepEqual(metrics, [
            {
                help: 'the number',
                key: 'test_prefix_number',
                label: undefined,
                type: 'gauge',
                value: '42'
            }
        ], 'resulting metrics match expectations');

        t.end();
    });
});
