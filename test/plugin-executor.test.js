/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/* Test the plugin collector's executor */
'use strict';

var mod_bunyan = require('bunyan');
var test = require('tape').test;

var lib_executor = require('../lib/plugin-executor');

var log = mod_bunyan.createLogger({
    level: 'fatal',
    name: 'plugin-executor-test'
});

test('executor should work with "echo"', function _test(t) {
    var execArgs;
    var executor;
    var opts = {
        log: log,
        maxOutput: 10 * 1024
    };

    executor = new lib_executor(opts);

    execArgs = {
        path: '/usr/bin/echo',
        timeout: 1000,
        zonename: '6128fb7e-d650-11e7-964d-73d0b046713f'
    };

    executor.exec(execArgs, function _onExec(err, output) {
        t.ifError(err, 'executor should exec echo successfully');
        t.equal(output, execArgs.zonename + '\n', 'output should be zonename');
        t.end();
    });
});
