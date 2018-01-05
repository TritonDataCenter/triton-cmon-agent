/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

'use strict';

var fs = require('fs');
var path = require('path');

var mod_assert = require('assert-plus');
var mod_vasync = require('vasync');

var JSON_FILENAME = 'plugin.json';

function PluginDirLoader(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.number(opts.defaultTimeout, 'opts.defaultTimeout');
    mod_assert.number(opts.defaultTTL, 'opts.defaultTTL');
    mod_assert.optionalBool(opts.enforceRoot, 'opts.enforceRoot');
    mod_assert.object(opts.log, 'opts.log');

    self.log = opts.log;
    self.defaultTimeout = opts.defaultTimeout;
    self.defaultTTL = opts.defaultTTL;
    self.enforceRoot = Boolean(opts.enforceRoot);
}

function loadPluginJson(jsonFile, callback) {
    var pluginInfo = {};

    fs.readFile(jsonFile, function _onJSONFile(err, data) {
        if (err && err.code === 'ENOENT') {
            callback(null, pluginInfo);
            return;
        }

        if (err) {
            callback(err);
            return;
        }

        try {
            pluginInfo = JSON.parse(data);
        } catch (e) {
            callback(e);
            return;
        }

        callback(null, pluginInfo);
    });
}

PluginDirLoader.prototype.load = function load(dir, callback) {
    var self = this;

    mod_assert.string(dir, 'dir');
    mod_assert.func(callback, 'callback');

    var err;
    var plugins = [];

    // Before looking at any files, we make sure the directory is owned by root.
    fs.stat(dir, function onStat(dirStatErr, dirStats) {
        var jsonFile;

        if (dirStatErr) {
            callback(dirStatErr);
            return;
        }

        if (!dirStats.isDirectory()) {
            err = new Error(dir + ' is not a directory');
            err.code = 'ENOTDIR';
            callback(err);
            return;
        }

        if (self.enforceRoot && dirStats.uid !== 0) {
            err = new Error(dir + ' is not owned by root');
            err.code = 'ENOPERM';
            callback(err);
            return;
        }

        jsonFile = path.join(dir, JSON_FILENAME);

        loadPluginJson(jsonFile, function onJson(loadJsonErr, pluginInfo) {
            if (loadJsonErr) {
                callback(loadJsonErr);
                return;
            }

            fs.readdir(dir, function onReadDir(loadErr, files) {
                if (loadErr) {
                    callback(loadErr);
                    return;
                }

                mod_vasync.forEachPipeline({
                    func: function _loadCollector(fileName, cb) {
                        var filePath = path.join(dir, fileName);
                        var info;
                        var pluginObj;

                        if (fileName === JSON_FILENAME) {
                            // We already loaded this earlier if it existed.
                            cb();
                            return;
                        }

                        fs.access(filePath, fs.X_OK,
                            function onFileAccess(fileAccessErr) {

                            if (fileAccessErr) {
                                self.log.warn({
                                    err: fileAccessErr,
                                    filename: filePath
                                }, 'file is not executable');
                                cb();
                                return;
                            }

                            pluginObj = {
                                name: path.basename(fileName,
                                    path.extname(fileName)),
                                path: path.join(dir, fileName),
                                timeout: self.defaultTimeout,
                                ttl: self.defaultTTL
                            };

                            if (pluginInfo.hasOwnProperty(
                                path.basename(fileName))) {

                                info = pluginInfo[path.basename(fileName)];
                                if (info.hasOwnProperty('timeout')) {
                                    pluginObj.timeout = info.timeout;
                                }
                                if (info.hasOwnProperty('ttl')) {
                                    pluginObj.ttl = info.ttl;
                                }
                            } else {
                                self.log.trace({
                                    pluginInfo: pluginInfo,
                                    fileName: fileName
                                }, 'pluginInfo has no entry for ' + fileName);
                            }

                            // enforce sanity
                            mod_assert.string(pluginObj.name, 'pluginObj.name');
                            mod_assert.string(pluginObj.path, 'pluginObj.path');
                            mod_assert.number(pluginObj.timeout,
                                'pluginObj.timeout');
                            mod_assert.number(pluginObj.ttl, 'pluginObj.ttl');

                            plugins.push(pluginObj);

                            cb();
                        });
                    },
                    inputs: files
                }, function _afterLoadingCollectors(loadCollectorsErr) {
                    callback(loadCollectorsErr, plugins);
                });
            });
        });
    });
};

module.exports = PluginDirLoader;
