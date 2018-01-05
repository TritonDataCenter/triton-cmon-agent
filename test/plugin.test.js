/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/* Test the backend for the plugin collector */

'use strict';

var test = require('tape').test;

var mod_assert = require('assert-plus');
var mod_bunyan = require('bunyan');
var mod_vasync = require('vasync');

var collector_harness = require('./collector-harness');
var lib_plugin_collector =
    require('../lib/instrumenter/collectors-common/plugin');
var normalizeTimers = collector_harness.normalizeTimers;

var log = mod_bunyan.createLogger({
    level: 'fatal',
    name: 'plugin-executor-test'
});

var DEFAULT_TIMEOUT = 1000;
var DEFAULT_TTL = 10;


// For purposes of testing, we use this fake plugin object. It treats name and
// path as interchangable to simplify things, and you pass your plugins as:
//
// opts: {
//    gzPlugins: {
//        <name>: {
//            func: function (opts, callback) {
//                <opts has: .zonename, .timeout>
//                <callback should be called as: callback(err, output)>
//            },
//            timeout: <timeout>,
//            ttl: <ttl>
//        }
//    },
//    vmPlugins: {
//        <name>: {
//            func: function (opts, callback) {
//                <opts has: .zonename, .timeout>
//                <callback should be called as: callback(err, output)>
//            },
//            timeout: <timeout>,
//            ttl: <ttl>
//        }
//    },
// }
//

function FakePlugins(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.optionalObject(opts.constants, 'opts.constants');
    mod_assert.optionalObject(opts.gzPlugins, 'opts.gzPlugins');
    mod_assert.optionalObject(opts.vmPlugins, 'opts.vmPlugins');

    if (opts.constants) {
        self.constants = opts.constants;
    } else {
        self.constants = {};
    }

    if (!self.constants.hasOwnProperty('gzScriptDir')) {
        self.constants.gzScriptDir = 'gz';
    }

    if (!self.constants.hasOwnProperty('vmScriptDir')) {
        self.constants.vmScriptDir = 'vm';
    }

    self.gzPlugins = opts.gzPlugins || {};
    self.vmPlugins = opts.vmPlugins || {};
}

FakePlugins.prototype.load = function load(dir, callback) {
    var self = this;

    var idx;
    var key;
    var keys;
    var plugins = [];
    var whichPlugins;

    if (dir === 'gz') {
        whichPlugins = self.gzPlugins;
    } else if (dir === 'vm') {
        whichPlugins = self.vmPlugins;
    }

    mod_assert.object(whichPlugins, 'whichPlugins');

    keys = Object.keys(whichPlugins);
    for (idx = 0; idx < keys.length; idx++) {
        key = keys[idx];

        // Plugins must have a `func` if they're going to work later.
        mod_assert.func(whichPlugins[key].func, 'plugins[' + key + '].func');

        plugins.push({
            name: whichPlugins[key].name || key,
            path: key,
            timeout: whichPlugins[key].timeout || DEFAULT_TIMEOUT,
            ttl: whichPlugins[key].ttl || DEFAULT_TTL
        });
    }

    callback(null, plugins);
};

FakePlugins.prototype.exec = function exec(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.path, 'opts.path');
    mod_assert.number(opts.timeout, 'opts.timeout');
    mod_assert.string(opts.zonename, 'opts.zonename');
    mod_assert.func(callback, 'callback');

    var whichPlugins;
    var pluginFn;

    if (opts.zonename === 'global') {
        whichPlugins = self.gzPlugins;
    } else {
        whichPlugins = self.vmPlugins;
    }
    mod_assert.object(whichPlugins, 'whichPlugins');

    pluginFn = whichPlugins[opts.path].func;
    mod_assert.func(pluginFn, 'pluginFn');

    // execute the plugin
    pluginFn(opts, callback);
};


test('loading non-existent plugin should fail', function _test(t) {
    var collector;
    var fakePlugins = new FakePlugins({
        gzPlugins: {
            dummy: {
                func: function dummyPlugin(_, callback) {
                    callback(new Error('should not get here'));
                }
            }
        }
    });

    collector = new lib_plugin_collector({
        log: log,
        pluginOpts: {
            constants: fakePlugins.constants,
            dirLoader: fakePlugins,
            executor: fakePlugins
        }
    });

    // try to get metrics from the 'foo' plugin, which doesn't exist
    collector.getMetrics({
        subCollector: 'foo',
        zInfo: {
            zonename: 'global'
        }
    }, function _onMetrics(err, metrics) {
        t.ok(err, 'should have had an error loading plugin "foo"');
        t.equal(err.message, 'foo: plugin not found',
            'message should indicate plugin does not exist');
        t.equal(metrics, undefined, 'metrics should be undefined');

        t.end();
    });
});

// test with both vm and gz "plugins", that only the vm plugins are run when
// a non-global zonename is passed.
test('only VM plugins run when loading VM metrics', function _test(t) {
    var collector;
    var fakePlugins;
    var ranGzPlugin = false;
    var ranVmPlugin = false;

    fakePlugins = new FakePlugins({
        gzPlugins: {
            dummy: {
                func: function dummyPlugin(_, callback) {
                    ranGzPlugin = true;
                    callback(null, '');
                }
            }
        },
        vmPlugins: {
            dummy: {
                func: function dummyPlugin(_, callback) {
                    ranVmPlugin = true;
                    callback(null, 'dummy\tgauge\t6\ta dummy number\n');
                }
            }
        }
    });

    collector = new lib_plugin_collector({
        log: log,
        pluginOpts: {
            constants: fakePlugins.constants,
            dirLoader: fakePlugins,
            executor: fakePlugins
        }
    });

    // try to get metrics from the 'dummy' plugin for VM
    collector.getMetrics({
        subCollector: 'dummy',
        zInfo: {
            zonename: 'c6ba1a62-d66a-11e7-a89f-bfa0a29ee5c3'
        }
    }, function _onMetrics(err, metrics) {
        t.ifError(err, 'should be no error loading dummy metrics');

        t.equal(ranGzPlugin, false, 'should not have run GZ plugin');
        t.equal(ranVmPlugin, true, 'should have run VM plugin');
        t.deepEqual(metrics, [
            {
                help: 'a dummy number',
                key: 'plugin_dummy_dummy',
                label: undefined,
                type: 'gauge',
                value: '6'
            }
        ], 'metrics should have our dummy number');

        t.end();
    });
});

// test with both vm and gz "plugins", that only the gz plugins are run when
// a 'global' zonename is passed.
test('only GZ plugins run when loading GZ metrics', function _test(t) {
    var collector;
    var fakePlugins;
    var ranGzPlugin = false;
    var ranVmPlugin = false;

    fakePlugins = new FakePlugins({
        gzPlugins: {
            dummy: {
                func: function dummyPlugin(_, callback) {
                    ranGzPlugin = true;
                    callback(null, 'dummy\tgauge\t55\ta dummy number\n');
                }
            }
        },
        vmPlugins: {
            dummy: {
                func: function dummyPlugin(_, callback) {
                    ranVmPlugin = true;
                    callback(null, '');
                }
            }
        }
    });

    collector = new lib_plugin_collector({
        log: log,
        pluginOpts: {
            constants: fakePlugins.constants,
            dirLoader: fakePlugins,
            executor: fakePlugins
        }
    });

    // try to get metrics from the 'dummy' plugin for GZ
    collector.getMetrics({
        subCollector: 'dummy',
        zInfo: {
            zonename: 'global'
        }
    }, function _onMetrics(err, metrics) {
        t.ifError(err, 'should be no error loading dummy metrics');

        t.equal(ranGzPlugin, true, 'should have run GZ plugin');
        t.equal(ranVmPlugin, false, 'should not have run VM plugin');
        t.deepEqual(metrics, [
            {
                help: 'a dummy number',
                key: 'plugin_dummy_dummy',
                label: undefined,
                type: 'gauge',
                value: '55'
            }
        ], 'metrics should have our dummy number');

        t.end();
    });
});

test('ensure we can get metrics from multiple plugins', function _test(t) {
    /* eslint-disable */
    /* BEGIN JSSTYLED */
    var expectedMetrics = [
        '# HELP plugin_plugin1_metrics_available_boolean Whether plugin_plugin1 metrics were available, 0 = false, 1 = true',
        '# TYPE plugin_plugin1_metrics_available_boolean gauge',
        'plugin_plugin1_metrics_available_boolean 1',
        '# HELP plugin_plugin1_metrics_cached_boolean Whether plugin_plugin1 metrics came from cache, 0 = false, 1 = true',
        '# TYPE plugin_plugin1_metrics_cached_boolean gauge',
        'plugin_plugin1_metrics_cached_boolean 0',
        '# HELP plugin_plugin1_metrics_timer_seconds How long it took to gather the plugin_plugin1 metrics',
        '# TYPE plugin_plugin1_metrics_timer_seconds gauge',
        'plugin_plugin1_metrics_timer_seconds 0.0',
        '# HELP plugin_plugin1_metric1 we are number 1',
        '# TYPE plugin_plugin1_metric1 gauge',
        'plugin_plugin1_metric1 111',
        '# HELP plugin_plugin2_metrics_available_boolean Whether plugin_plugin2 metrics were available, 0 = false, 1 = true',
        '# TYPE plugin_plugin2_metrics_available_boolean gauge',
        'plugin_plugin2_metrics_available_boolean 1',
        '# HELP plugin_plugin2_metrics_cached_boolean Whether plugin_plugin2 metrics came from cache, 0 = false, 1 = true',
        '# TYPE plugin_plugin2_metrics_cached_boolean gauge',
        'plugin_plugin2_metrics_cached_boolean 0',
        '# HELP plugin_plugin2_metrics_timer_seconds How long it took to gather the plugin_plugin2 metrics',
        '# TYPE plugin_plugin2_metrics_timer_seconds gauge',
        'plugin_plugin2_metrics_timer_seconds 0.0',
        '# HELP plugin_plugin2_metric2 we are number 2',
        '# TYPE plugin_plugin2_metric2 gauge',
        'plugin_plugin2_metric2 222'
    ];
    /* END JSSTYLED */
    /* eslint-enable */
    var fakePlugins;
    var mockData = {};

    fakePlugins = new FakePlugins({
        gzPlugins: {
            plugin1: {
                func: function plugin1(_, callback) {
                    callback(null, 'metric1\tgauge\t111\twe are number 1\n');
                }
            },
            plugin2: {
                func: function plugin2(_, callback) {
                    callback(null, 'metric2\tgauge\t222\twe are number 2\n');
                }
            }
        }
    });

    collector_harness.createMasterCollector({
        enabledCollectors: {
            'collectors-common': {
                'plugin': true
            }
        },
        mockData: mockData,
        pluginOpts: {
            constants: fakePlugins.constants,
            dirLoader: fakePlugins,
            executor: fakePlugins
        }
    }, function _collectorCreatedCb(masterCollector) {
        masterCollector.getMetrics('gz', function _gotMetricsCb(err, metrics) {
            t.ifError(err, 'getMetrics should succeed for GZ');
            if (!err) {
                t.deepEqual(normalizeTimers(metrics).trim()
                    .split('\n'), expectedMetrics,
                    'plugin metrics output matches expected');
            }
            masterCollector.stop();
            t.end();
        });
    });
});

test('ensure we can get multiple metrics from one plugin', function _test(t) {
    /* eslint-disable */
    /* BEGIN JSSTYLED */
    var expectedMetrics = [
        '# HELP plugin_multiball_metrics_available_boolean Whether plugin_multiball metrics were available, 0 = false, 1 = true',
        '# TYPE plugin_multiball_metrics_available_boolean gauge',
        'plugin_multiball_metrics_available_boolean 1',
        '# HELP plugin_multiball_metrics_cached_boolean Whether plugin_multiball metrics came from cache, 0 = false, 1 = true',
        '# TYPE plugin_multiball_metrics_cached_boolean gauge',
        'plugin_multiball_metrics_cached_boolean 0',
        '# HELP plugin_multiball_metrics_timer_seconds How long it took to gather the plugin_multiball metrics',
        '# TYPE plugin_multiball_metrics_timer_seconds gauge',
        'plugin_multiball_metrics_timer_seconds 0.0',
        '# HELP plugin_multiball_ball1 1st post',
        '# TYPE plugin_multiball_ball1 gauge',
        'plugin_multiball_ball1 1000000',
        '# HELP plugin_multiball_ball2 too slow',
        '# TYPE plugin_multiball_ball2 gauge',
        'plugin_multiball_ball2 2000000',
        '# HELP plugin_multiball_ball3 last word',
        '# TYPE plugin_multiball_ball3 gauge',
        'plugin_multiball_ball3 3000000'
    ];
    /* END JSSTYLED */
    /* eslint-enable */
    var fakePlugins;
    var mockData = {};

    fakePlugins = new FakePlugins({
        gzPlugins: {
            multiball: {
                func: function multiball(_, callback) {
                    callback(null, [
                        'ball1\tgauge\t1000000\t1st post',
                        'ball2\tgauge\t2000000\ttoo slow',
                        'ball3\tgauge\t3000000\tlast word'
                    ].join('\n') + '\n');
                }
            }
        }
    });

    collector_harness.createMasterCollector({
        enabledCollectors: {
            'collectors-common': {
                'plugin': true
            }
        },
        mockData: mockData,
        pluginOpts: {
            constants: fakePlugins.constants,
            dirLoader: fakePlugins,
            executor: fakePlugins
        }
    }, function _collectorCreatedCb(masterCollector) {
        masterCollector.getMetrics('gz', function _gotMetricsCb(err, metrics) {
            t.ifError(err, 'getMetrics should succeed for GZ');
            if (!err) {
                t.deepEqual(normalizeTimers(metrics).trim()
                    .split('\n'), expectedMetrics,
                    'plugin metrics output matches expected');
            }
            masterCollector.stop();
            t.end();
        });
    });
});

test('too many plugins should cause drops', function _test(t) {
    // With too many plugins running at once, some output should get dropped.

    /* eslint-disable */
    /* BEGIN JSSTYLED */
    var expectedMetrics = [
        '# HELP plugin_instance_number_metrics_available_boolean Whether plugin_instance_number metrics were available, 0 = false, 1 = true',
        '# TYPE plugin_instance_number_metrics_available_boolean gauge',
        'plugin_instance_number_metrics_available_boolean 0',
        '# HELP plugin_instance_number_metrics_cached_boolean Whether plugin_instance_number metrics came from cache, 0 = false, 1 = true',
        '# TYPE plugin_instance_number_metrics_cached_boolean gauge',
        'plugin_instance_number_metrics_cached_boolean 0',
        '# HELP plugin_instance_number_metrics_timer_seconds How long it took to gather the plugin_instance_number metrics',
        '# TYPE plugin_instance_number_metrics_timer_seconds gauge',
        'plugin_instance_number_metrics_timer_seconds 0.0',

        '# HELP plugin_instance_number_metrics_available_boolean Whether plugin_instance_number metrics were available, 0 = false, 1 = true',
        '# TYPE plugin_instance_number_metrics_available_boolean gauge',
        'plugin_instance_number_metrics_available_boolean 1',
        '# HELP plugin_instance_number_metrics_cached_boolean Whether plugin_instance_number metrics came from cache, 0 = false, 1 = true',
        '# TYPE plugin_instance_number_metrics_cached_boolean gauge',
        'plugin_instance_number_metrics_cached_boolean 0',
        '# HELP plugin_instance_number_metrics_timer_seconds How long it took to gather the plugin_instance_number metrics',
        '# TYPE plugin_instance_number_metrics_timer_seconds gauge',
        'plugin_instance_number_metrics_timer_seconds 0.0',
        '# HELP plugin_instance_number_index instance id of e1620d6a-c652-4b0d-b816-1bbdda080810',
        '# TYPE plugin_instance_number_index gauge',
        'plugin_instance_number_index 1',

        '# HELP plugin_instance_number_metrics_available_boolean Whether plugin_instance_number metrics were available, 0 = false, 1 = true',
        '# TYPE plugin_instance_number_metrics_available_boolean gauge',
        'plugin_instance_number_metrics_available_boolean 1',
        '# HELP plugin_instance_number_metrics_cached_boolean Whether plugin_instance_number metrics came from cache, 0 = false, 1 = true',
        '# TYPE plugin_instance_number_metrics_cached_boolean gauge',
        'plugin_instance_number_metrics_cached_boolean 0',
        '# HELP plugin_instance_number_metrics_timer_seconds How long it took to gather the plugin_instance_number metrics',
        '# TYPE plugin_instance_number_metrics_timer_seconds gauge',
        'plugin_instance_number_metrics_timer_seconds 0.0',
        '# HELP plugin_instance_number_index instance id of d423fe0f-5a9c-4b61-b36a-f30ee042ab10',
        '# TYPE plugin_instance_number_index gauge',
        'plugin_instance_number_index 2'
    ];
    /* END JSSTYLED */
    /* eslint-enable */
    var fakePlugins;
    var mockData = {
        vms: {
            'e1620d6a-c652-4b0d-b816-1bbdda080810': {
                instance: 1
            },
            'd423fe0f-5a9c-4b61-b36a-f30ee042ab10': {
                instance: 2
            },
            '5cd3e288-a147-4c71-bcde-b8bd37637a24': {
                instance: 3
            }
        }
    };

    fakePlugins = new FakePlugins({
        constants: {
            pluginMaxConcurrent: 2
        },
        vmPlugins: {
            instance_number: {
                func: function instanceNumber(opts, callback) {
                    var delay = 100;

                    // last one will have no delay, so it can fail
                    if (opts.zonename === Object.keys(mockData.vms)[2]) {
                        delay = 0;
                    }

                    setTimeout(function _delayedAwesome() {
                        callback(null, 'index\tgauge\t' +
                            mockData.vms[opts.zonename].instance +
                            '\tinstance id of ' + opts.zonename  + '\n');
                    }, delay);
                }
            }
        }
    });

    collector_harness.createMasterCollector({
        enabledCollectors: {
            'collectors-common': {
                'plugin': true
            }
        },
        mockData: mockData,
        pluginOpts: {
            constants: fakePlugins.constants,
            dirLoader: fakePlugins,
            executor: fakePlugins
        }
    }, function _collectorCreatedCb(masterCollector) {
        mod_vasync.forEachParallel({
            func: masterCollector.getMetrics.bind(masterCollector),
            inputs: Object.keys(mockData.vms)
        }, function _parallelResults(err, results) {
            var idx;
            var metrics = '';

            t.ifError(err, 'should be no error loading metrics in parallel');

            if (!err) {
                for (idx = 0; idx < results.successes.length; idx++) {
                    metrics += results.successes[idx];
                }
                t.deepEqual(normalizeTimers(metrics).trim()
                    .split('\n'), expectedMetrics,
                    'plugin metrics output matches expected');
            }

            masterCollector.stop();
            t.end();
        });
    });
});

function generateGarbage() {
    var buf;
    var idx;
    var len = 0;

    len = Math.floor(Math.random() * 1024);
    buf = new Buffer(len);

    for (idx = 0; idx < len; idx++) {
        buf[idx] = Math.floor((Math.random() * 16 * 1024));
    }

    return (buf.toString());
}

test('garbage output should be no problem', function _test(t) {
    // When a plugin returns random garbage, we should just treat it as broken
    // (metrics unavailable)

    /* eslint-disable */
    /* BEGIN JSSTYLED */
    var expectedMetrics = [
        '# HELP plugin_garbage_barge_metrics_available_boolean Whether plugin_garbage_barge metrics were available, 0 = false, 1 = true',
        '# TYPE plugin_garbage_barge_metrics_available_boolean gauge',
        'plugin_garbage_barge_metrics_available_boolean 0',
        '# HELP plugin_garbage_barge_metrics_cached_boolean Whether plugin_garbage_barge metrics came from cache, 0 = false, 1 = true',
        '# TYPE plugin_garbage_barge_metrics_cached_boolean gauge',
        'plugin_garbage_barge_metrics_cached_boolean 0',
        '# HELP plugin_garbage_barge_metrics_timer_seconds How long it took to gather the plugin_garbage_barge metrics',
        '# TYPE plugin_garbage_barge_metrics_timer_seconds gauge',
        'plugin_garbage_barge_metrics_timer_seconds 0.0'
    ];
    /* END JSSTYLED */
    /* eslint-enable */
    var fakePlugins;
    var mockData = {};

    fakePlugins = new FakePlugins({
        gzPlugins: {
            garbage_barge: {
                func: function garbageBarge(_, callback) {
                    var garbage = generateGarbage();

                    callback(null, garbage);
                }
            }
        }
    });

    collector_harness.createMasterCollector({
        enabledCollectors: {
            'collectors-common': {
                'plugin': true
            }
        },
        mockData: mockData,
        pluginOpts: {
            constants: fakePlugins.constants,
            dirLoader: fakePlugins,
            executor: fakePlugins
        }
    }, function _collectorCreatedCb(masterCollector) {
        masterCollector.getMetrics('gz', function _gotMetricsCb(err, metrics) {
            t.ifError(err, 'getMetrics should succeed for GZ');
            if (!err) {
                t.deepEqual(normalizeTimers(metrics).trim()
                    .split('\n'), expectedMetrics,
                    'plugin metrics output matches expected');
            }
            masterCollector.stop();
            t.end();
        });
    });
});

test('no output should be no problem', function _test(t) {
    // When a plugin returns no output, we should just treat it as broken
    // (metrics unavailable)

    /* eslint-disable */
    /* BEGIN JSSTYLED */
    var expectedMetrics = [
        '# HELP plugin_empty_hole_metrics_available_boolean Whether plugin_empty_hole metrics were available, 0 = false, 1 = true',
        '# TYPE plugin_empty_hole_metrics_available_boolean gauge',
        'plugin_empty_hole_metrics_available_boolean 0',
        '# HELP plugin_empty_hole_metrics_cached_boolean Whether plugin_empty_hole metrics came from cache, 0 = false, 1 = true',
        '# TYPE plugin_empty_hole_metrics_cached_boolean gauge',
        'plugin_empty_hole_metrics_cached_boolean 0',
        '# HELP plugin_empty_hole_metrics_timer_seconds How long it took to gather the plugin_empty_hole metrics',
        '# TYPE plugin_empty_hole_metrics_timer_seconds gauge',
        'plugin_empty_hole_metrics_timer_seconds 0.0'
    ];
    /* END JSSTYLED */
    /* eslint-enable */
    var fakePlugins;
    var mockData = {};

    fakePlugins = new FakePlugins({
        gzPlugins: {
            empty_hole: {
                func: function nothingToReport(_, callback) {
                    callback(null, '');
                }
            }
        }
    });

    collector_harness.createMasterCollector({
        enabledCollectors: {
            'collectors-common': {
                'plugin': true
            }
        },
        mockData: mockData,
        pluginOpts: {
            constants: fakePlugins.constants,
            dirLoader: fakePlugins,
            executor: fakePlugins
        }
    }, function _collectorCreatedCb(masterCollector) {
        masterCollector.getMetrics('gz', function _gotMetricsCb(err, metrics) {
            t.ifError(err, 'getMetrics should succeed for GZ');
            if (!err) {
                t.deepEqual(normalizeTimers(metrics).trim()
                    .split('\n'), expectedMetrics,
                    'plugin metrics output matches expected');
            }
            masterCollector.stop();
            t.end();
        });
    });
});

test('when plugin times out, should be killed', function _test(t) {
    // This actually tests 2 things:
    //
    //  * that when the timeout is reached, the executor kills the plugin
    //  * that when a plugin dies unexpectedly, the result is an unavailable
    //    metric
    //

    /* eslint-disable */
    /* BEGIN JSSTYLED */
    var expectedMetrics = [
        '# HELP plugin_sleepy_metrics_available_boolean Whether plugin_sleepy metrics were available, 0 = false, 1 = true',
        '# TYPE plugin_sleepy_metrics_available_boolean gauge',
        'plugin_sleepy_metrics_available_boolean 0',
        '# HELP plugin_sleepy_metrics_cached_boolean Whether plugin_sleepy metrics came from cache, 0 = false, 1 = true',
        '# TYPE plugin_sleepy_metrics_cached_boolean gauge',
        'plugin_sleepy_metrics_cached_boolean 0',
        '# HELP plugin_sleepy_metrics_timer_seconds How long it took to gather the plugin_sleepy metrics',
        '# TYPE plugin_sleepy_metrics_timer_seconds gauge',
        'plugin_sleepy_metrics_timer_seconds 0.0'
    ];
    /* END JSSTYLED */
    /* eslint-enable */
    var fakePlugins;
    var mockData = {
        vms: {
            '86400': {
                instance: 86400
            }
        }
    };

    fakePlugins = new FakePlugins({
        vmPlugins: {
            '/usr/bin/sleep': {
                func: function _notCalled() {
                    process.abort('should not have been called');
                },
                name: 'sleepy',
                timeout: 10 // ms
            }
        }
    });

    collector_harness.createMasterCollector({
        enabledCollectors: {
            'collectors-common': {
                'plugin': true
            }
        },
        mockData: mockData,
        pluginOpts: {
            constants: fakePlugins.constants,
            dirLoader: fakePlugins
        }
    }, function _collectorCreatedCb(masterCollector) {
        // Cheat here and use a number instead of a zonename, since that's going
        // to be used as the command parameter, we'll end up with:
        //
        //   sleep 86400
        //
        masterCollector.getMetrics('86400',
            function _gotMetricsCb(err, metrics) {

            t.ifError(err, 'getMetrics should succeed');
            if (!err) {
                t.deepEqual(normalizeTimers(metrics).trim()
                    .split('\n'), expectedMetrics,
                    'plugin metrics output matches expected');
            }
            masterCollector.stop();
            t.end();
        });
    });
});

test('when plugin outputs too much, it should be killed', function _test(t) {
    // This actually tests 2 things:
    //
    //  * that when the plugin outputs too much, the executor kills the plugin
    //  * that when a plugin dies unexpectedly, the result is an unavailable
    //    metric
    //

    /* eslint-disable */
    /* BEGIN JSSTYLED */
    var expectedMetrics = [
        '# HELP plugin_noisy_metrics_available_boolean Whether plugin_noisy metrics were available, 0 = false, 1 = true',
        '# TYPE plugin_noisy_metrics_available_boolean gauge',
        'plugin_noisy_metrics_available_boolean 0',
        '# HELP plugin_noisy_metrics_cached_boolean Whether plugin_noisy metrics came from cache, 0 = false, 1 = true',
        '# TYPE plugin_noisy_metrics_cached_boolean gauge',
        'plugin_noisy_metrics_cached_boolean 0',
        '# HELP plugin_noisy_metrics_timer_seconds How long it took to gather the plugin_noisy metrics',
        '# TYPE plugin_noisy_metrics_timer_seconds gauge',
        'plugin_noisy_metrics_timer_seconds 0.0'
    ];
    /* END JSSTYLED */
    /* eslint-enable */
    var fakePlugins;
    var mockData = {};

    fakePlugins = new FakePlugins({
        gzPlugins: {
            '/usr/bin/yes': {
                func: function _notCalled() {
                    process.abort('should not have been called');
                },
                name: 'noisy',
                timeout: 300 * 1000 // ms
            }
        }
    });

    collector_harness.createMasterCollector({
        enabledCollectors: {
            'collectors-common': {
                'plugin': true
            }
        },
        mockData: mockData,
        pluginOpts: {
            constants: fakePlugins.constants,
            dirLoader: fakePlugins
        }
    }, function _collectorCreatedCb(masterCollector) {
        // Cheat here and use a number instead of a zonename, since that's going
        // to be used as the command parameter, we'll end up with:
        //
        //   sleep 86400
        //
        masterCollector.getMetrics('gz', function _gotMetricsCb(err, metrics) {
            t.ifError(err, 'getMetrics should succeed');
            if (!err) {
                t.deepEqual(normalizeTimers(metrics).trim()
                    .split('\n'), expectedMetrics,
                    'plugin metrics output matches expected');
            }
            masterCollector.stop();
            t.end();
        });
    });
});

test('test that ttl option in metric output works', function _test(t) {
    /* eslint-disable */
    /* BEGIN JSSTYLED */
    var expectedMetrics = [
        '# HELP plugin_decaying_metrics_available_boolean Whether plugin_decaying metrics were available, 0 = false, 1 = true',
        '# TYPE plugin_decaying_metrics_available_boolean gauge',
        'plugin_decaying_metrics_available_boolean 1',
        '# HELP plugin_decaying_metrics_cached_boolean Whether plugin_decaying metrics came from cache, 0 = false, 1 = true',
        '# TYPE plugin_decaying_metrics_cached_boolean gauge',
        'plugin_decaying_metrics_cached_boolean 0',
        '# HELP plugin_decaying_metrics_timer_seconds How long it took to gather the plugin_decaying metrics',
        '# TYPE plugin_decaying_metrics_timer_seconds gauge',
        'plugin_decaying_metrics_timer_seconds 0.0',
        '# HELP plugin_decaying_rot_percent percent of rottenness',
        '# TYPE plugin_decaying_rot_percent gauge',
        'plugin_decaying_rot_percent 66'
    ];
    /* END JSSTYLED */
    /* eslint-enable */
    var fakePlugins;
    var mockData = {};

    fakePlugins = new FakePlugins({
        gzPlugins: {
            'decaying': {
                func: function decaying(_, callback) {
                    callback(null, [
                        'ttl\toption\t90201\tthis help is ignored',
                        'rot_percent\tgauge\t66\tpercent of rottenness'
                    ].join('\n') + '\n');
                }
            }
        }
    });

    collector_harness.createMasterCollector({
        enabledCollectors: {
            'collectors-common': {
                'plugin': true
            }
        },
        mockData: mockData,
        pluginOpts: {
            constants: fakePlugins.constants,
            dirLoader: fakePlugins,
            executor: fakePlugins
        }
    }, function _collectorCreatedCb(masterCollector) {
        masterCollector.getMetrics('gz', function _gotMetricsCb(err, metrics) {
            var cacheKey = 'collectors-common/plugin/decaying/global';

            t.ifError(err, 'getMetrics should succeed');
            if (!err) {
                t.deepEqual(normalizeTimers(metrics).trim()
                    .split('\n'), expectedMetrics,
                    'plugin metrics output matches expected');
            }

            // Now sneak to check the TTL in the cache, to make sure our option
            // worked.
            t.equal(masterCollector.cache._items[cacheKey].TTL, 90201000,
                'expected cache TTL to match our option line');

            masterCollector.stop();
            t.end();
        });
    });
});
