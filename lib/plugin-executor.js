/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

'use strict';

var mod_assert = require('assert-plus');
var mod_forkexec = require('forkexec');

function PluginExecutor(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.number(opts.maxOutput, 'opts.maxOutput');

    self.log = opts.log;
    self.maxOutput = opts.maxOutput;
}

PluginExecutor.prototype.exec = function load(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.path, 'opts.path');
    mod_assert.number(opts.timeout, 'opts.timeout');
    mod_assert.string(opts.zonename, 'opts.zonename');
    mod_assert.func(callback, 'callback');

    mod_forkexec.forkExecWait({
        argv: [opts.path, opts.zonename],
        maxBuffer: self.maxOutput,
        timeout: opts.timeout
    }, function _onForkWaited(err, info) {
        if (info.stderr && info.stderr.length > 0) {
            self.log.debug({
                path: opts.path,
                stderr: info.stderr.trim(),
                zonename: opts.zonename
            }, 'plugin wrote to stderr');
        }

        callback(err, (info && info.stdout) ? info.stdout : '');
    });
};

module.exports = PluginExecutor;
