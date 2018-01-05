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
var mod_verror = require('verror');

var PluginDirLoader = require('../../plugin-dir-loader');
var PluginExecutor = require('../../plugin-executor');
var PluginOutputParser = require('../../plugin-output-parser');

var DEFAULT_CONSTANTS = {
    gzScriptDir: '/opt/custom/cmon/gz-plugins',
    metricNamePrefix: 'plugin_',
    // pluginMaxConcurrent represents an arbitrarily chosen limit on number of
    // plugins running at once. Once this has some actual usage we'll be able to
    // get a better idea of what value makes sense here.
    pluginMaxConcurrent: 100,
    pluginMaxOutput: 10 * 1024, // bytes
    pluginReloadInterval: 60 * 1000, // ms
    pluginTimeout: 3 * 1000, // ms
    pluginTTL: 60, // seconds
    vmScriptDir: '/opt/custom/cmon/vm-plugins'
};

function PluginCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.optionalObject(opts.pluginOpts, 'opts.pluginOpts');
    if (opts.pluginOpts) {
        mod_assert.optionalObject(opts.pluginOpts.collector,
            'opts.pluginOpts.collector');
        mod_assert.optionalObject(opts.pluginOpts.dirLoader,
            'opts.pluginOpts.dirLoader');
        mod_assert.optionalObject(opts.pluginOpts.executor,
            'opts.pluginOpts.executor');
        mod_assert.optionalObject(opts.pluginOpts.outputParser,
            'opts.pluginOpts.outputParser');
    }

    var constant;
    var constantKeys;
    var idx;
    var pluginOpts = {};

    self.log = opts.log;

    self.constants = DEFAULT_CONSTANTS;
    self.lastReload = {};
    self.plugins = {};
    self.runningPlugins = 0;

    // MasterCollector will pass through the pluginOpts for tests.
    if (opts.pluginOpts) {
        pluginOpts = opts.pluginOpts;
    }

    // If pluginOpts.constants has a key, and self.constants has that same key,
    // replace the key in the self.constants with the value from
    // pluginOpts.constants.
    if (pluginOpts.hasOwnProperty('constants')) {
        constantKeys = Object.keys(pluginOpts.constants);
        for (idx = 0; idx < constantKeys.length; idx++) {
            constant = constantKeys[idx];
            if (self.constants.hasOwnProperty(constant)) {
                self.constants[constant] = pluginOpts.constants[constant];
            }
        }
    }

    self.pluginDirLoader = pluginOpts.dirLoader || new PluginDirLoader({
        defaultTimeout: self.constants.pluginTimeout,
        defaultTTL: self.constants.pluginTTL,
        log: self.log,
        enforceRoot: true
    });
    self.pluginExecutor = pluginOpts.executor || new PluginExecutor({
        log: self.log,
        maxOutput: self.constants.pluginMaxOutput
    });
    self.pluginOutputParser = pluginOpts.outputParser ||
        new PluginOutputParser({
            log: self.log
        });

    // Indicates that it's ok for plugins to be unavaliable.
    self.EMPTY_OK = true;
}

function whichPluginDir(collector, zonename) {
    if (zonename === 'global') {
        return collector.constants.gzScriptDir;
    } else {
        return collector.constants.vmScriptDir;
    }
}

PluginCollector.prototype.loadPlugins = function loadPlugins(dir, callback) {
    var self = this;

    var now = (new Date()).getTime();

    // If we've never reloaded the plugin before, we'll not have a time recorded
    // for when it was reloaded. In this case, assume it was last reloaded at
    // second 0 of the epoch so that we force a reload. On reloading, we'll set
    // the lastReload time.
    if (self.lastReload[dir] === undefined) {
        self.lastReload[dir] = 0;
    }

    if (now < (self.lastReload[dir] + self.constants.pluginReloadInterval)) {
        // No need to reload yet, just use current data.
        mod_assert.arrayOfObject(self.plugins[dir], 'self.plugins[dir]');

        callback(null, self.plugins[dir]);
        return;
    }

    self.lastReload[dir] = now;

    // The first time we run, there won't be any plugins loaded yet, but we have
    // indicated by setting lastReload[dir] that we're reloading. In case some
    // other loadPlugins() requests come in while we're loading, we set plugins
    // to an empty array here if we don't have a previous set, so things don't
    // blow up.
    if (!self.plugins[dir]) {
        self.plugins[dir] = [];
    }

    self.log.trace({dir: dir}, '(re)loading plugin list');

    self.pluginDirLoader.load(dir, function _onload(err, plugins) {
        if (err) {
            self.plugins[dir] = [];
        } else {
            self.plugins[dir] = plugins;
        }
        callback(err, plugins);
    });
};

PluginCollector.prototype.getMetrics = function getMetrics(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.zInfo, 'opts.zInfo');
    mod_assert.string(opts.zInfo.zonename, 'opts.zInfo.zonename');
    mod_assert.string(opts.subCollector, 'opts.subCollector');
    mod_assert.func(callback, 'callback');

    var self = this;

    var dir;
    var idx;

    dir = whichPluginDir(self, opts.zInfo.zonename);

    self.loadPlugins(dir, function _onLoadPlugins(err, plugins) {
        var plugin;

        if (err && err.code === 'ENOENT') {
            self.log.trace({
                dir: dir,
                err: err,
                zonename: opts.zInfo.zonename
            }, 'could not find applicable plugins, returning empty metrics');
            callback(null, []);
            return;
        } else if (err) {
            callback(err);
            return;
        }

        for (idx = 0; idx < plugins.length; idx++) {
            plugin = plugins[idx];

            if (plugin.name === opts.subCollector) {
                if (self.runningPlugins >= self.constants.pluginMaxConcurrent) {
                    callback(new mod_verror({
                        name: 'NotAvailableError'
                    }, opts.subCollector + ': cannot run ' +
                        ' due to ' + self.runningPlugins +
                        ' plugins already running'));
                    return;
                }

                self.runningPlugins++;

                self.log.trace({
                    pluginName: opts.subCollector,
                    runningPlugins: self.runningPlugins
                }, 'running plugin');

                self.pluginExecutor.exec({
                    path: plugin.path,
                    timeout: plugin.timeout,
                    zonename: opts.zInfo.zonename
                }, function _afterExecution(execErr, output) {
                    self.runningPlugins--;

                    if (execErr) {
                        callback(new mod_verror({
                            cause: execErr,
                            name: 'NotAvailableError'
                        }, opts.subCollector +
                            ': failed to execute'));
                        return;
                    }

                    // callback() will be called with parseErr, metrics
                    self.pluginOutputParser.parse({
                        output: output,
                        prefix: self.constants.metricNamePrefix +
                            plugin.name + '_'
                    }, function _onParsed(parseErr, parsedMetrics) {
                        // Metric is unavailable if we can't parse the output.
                        if (parseErr) {
                            callback(new mod_verror({
                                cause: parseErr,
                                name: 'NotAvailableError'
                            }, opts.subCollector +
                                ': returned garbage output'));
                            return;
                        }

                        callback(null, parsedMetrics);
                    });
                });

                return;
            }
        }

        callback(new Error(opts.subCollector + ': plugin not found'));
    });
};

PluginCollector.prototype.getSubCollectors =
function getSubCollectors(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.zInfo, 'opts.zInfo');
    mod_assert.string(opts.zInfo.zonename, 'opts.zInfo.zonename');
    mod_assert.func(callback, 'callback');

    var self = this;

    var dir;
    var subCollectors = [];

    dir = whichPluginDir(self, opts.zInfo.zonename);

    self.loadPlugins(dir, function _onLoadPlugins(err, plugins) {
        if (err && err.code === 'ENOENT') {
            // No subCollectors if we couldn't load plugins.
            callback(null, subCollectors);
            return;
        } else if (err) {
            callback(err);
            return;
        }

        subCollectors = plugins.map(function _mapPlugin(plugin) {
            mod_assert.string(plugin.name, 'plugin.name');
            return plugin.name;
        });

        callback(null, subCollectors);
    });
};

PluginCollector.prototype.cacheTTL = function cacheTTL(opts) {
    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.subCollector, 'opts.subCollector');
    mod_assert.object(opts.zInfo, 'opts.zInfo');
    mod_assert.string(opts.zInfo.zonename, 'opts.zInfo.zonename');

    var self = this;

    var dir;
    var idx;
    var plugin;

    // Since we only call cacheTTL immediately after getMetrics, we should
    // always have just updated self.plugins, so we always just use that instead
    // of being asynchronous and trying to load. If the calling of cacheTTL
    // changes such that it happens before getMetric, we'll blow up here to make
    // that obvious.
    dir = whichPluginDir(self, opts.zInfo.zonename);
    mod_assert.array(self.plugins[dir], 'self.plugins[dir]');

    for (idx = 0; idx < self.plugins[dir].length; idx++) {
        plugin = self.plugins[dir][idx];

        if (plugin.name === opts.subCollector && plugin.hasOwnProperty('ttl')) {
            return (plugin.ttl);
        }
    }

    return (self.constants.pluginTTL);
};

module.exports = PluginCollector;
