/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/* Test the plugin collector's directory loader */
'use strict';

var mod_bunyan = require('bunyan');
var mod_path = require('path');
var test = require('tape').test;

var lib_dir_loader = require('../lib/plugin-dir-loader');

var log;
var TEST_PLUGIN_DIR = __dirname + '/testcases/plugin';

log = mod_bunyan.createLogger({
    level: 'fatal',
    name: 'plugin-dir-loader-test'
});

function pluginSorter(a, b) {
    return (a.name.localeCompare(b.name));
}

test('dir loader should load test dir', function _test(t) {
    var loader;
    var opts = {
        defaultTTL: 3,
        defaultTimeout: 3 * 1000,
        enforceRoot: false,
        log: log
    };

    loader = new lib_dir_loader(opts);

    loader.load(TEST_PLUGIN_DIR, function _onLoad(err, plugins) {
        t.ifError(err, 'loader should load plugin dir');
        t.deepEqual(plugins.sort(pluginSorter), [
            {
                name: 'plugin0',
                path: mod_path.join(TEST_PLUGIN_DIR, 'plugin0'),
                timeout: 100,
                ttl: 60
            },
            {
                name: 'plugin1',
                path: mod_path.join(TEST_PLUGIN_DIR, 'plugin1.sh'),
                timeout: 50,
                ttl: 30
            }
        ], 'loaded plugin data matches expectations');

        t.end();
    });
});
