/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */
'use strict';

// This file adapted from sdc-cn-agent ./lib/smartdc-config.js

var execFile = require('child_process').execFile;

function execFileParseJSON(bin, args, callback) {
    execFile(
        bin,
        args,
        function _execFileCb(error, stdout, stderr) {
            if (error) {
                callback(Error(stderr.toString()));
                return;
            }
            var obj = JSON.parse(stdout.toString());
            callback(null, obj);
        });
}

function sysinfo(callback) {
    execFileParseJSON(
        '/usr/bin/sysinfo',
        [],
        function _parseJSONCb(error, config) {
            if (error) {
                callback(error);
                return;
            }
            callback(null, config);
        });
}

function tritonConfig(callback) {
    execFileParseJSON(
        '/bin/bash',
        [ '/lib/sdc/config.sh', '-json' ],
        function _parseJSONCb(error, config) {
            if (error) {
                callback(error);
                return;
            }
            callback(null, config);
        });
}

module.exports = {
    tritonConfig: tritonConfig,
    sysinfo: sysinfo,
    execFileParseJSON: execFileParseJSON
};
