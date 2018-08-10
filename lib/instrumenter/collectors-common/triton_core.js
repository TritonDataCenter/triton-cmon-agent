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

var promToMetrics = require('../lib/parse-common').promToMetrics;

var TRITON_CORE_TTL = 5;

function TritonCoreCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.adminUuid, 'opts.adminUuid');
    mod_assert.object(opts.cache, 'opts.cache');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.object(opts.metricsManager, 'opts.metricsManager');
    mod_assert.func(opts.getTritonMetadata, 'opts.getTritonMetadata');
    mod_assert.func(opts.getTritonMetrics, 'opts.getTritonMetrics');
    mod_assert.object(opts.metricsManager, 'opts.metricsManager');

    self.adminUuid = opts.adminUuid;
    self.log = opts.log.child({collector: 'triton-core'});
    self.cache = opts.cache;
    self.getTritonMetadata = opts.getTritonMetadata;
    self.getTritonMetrics = opts.getTritonMetrics;
    self.metricsManager = opts.metricsManager;

    // If the VM is not a core Triton service or does not have a
    // metrics server implemented, it will return empty results.
    self.EMPTY_OK = true;
}

TritonCoreCollector.prototype.shouldRun =
function shouldRun(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.zInfo, 'opts.zInfo');
    mod_assert.string(opts.zInfo.zonename, 'opts.zInfo.zonename');
    mod_assert.func(callback, 'callback');

    if (opts.zInfo.zonename === 'global') {
        callback(null, true);
        return;
    }

    var getMetadataOpts = {
        adminUuid: self.adminUuid,
        cache: self.cache,
        log: self.log,
        zonename: opts.zInfo.zonename
    };

    self.getTritonMetadata(getMetadataOpts, function gotMetadata(err, data) {
        if (err) {
            callback(err);
            return;
        }

        callback(null, data.isCore);
    });
};

TritonCoreCollector.prototype.getMetrics =
function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.zInfo, 'opts.zInfo');
    mod_assert.string(opts.zInfo.zonename, 'opts.zInfo.zonename');
    mod_assert.func(callback, 'callback');

    var tmOpts = {
        adminUuid: self.adminUuid,
        cache: self.cache,
        log: self.log,
        metricsManager: self.metricsManager,
        zonename: opts.zInfo.zonename
    };

    self.getTritonMetrics(tmOpts,
    function gotMetrics(err, metricsStrings) {
        if (err) {
            callback(err);
            return;
        }

        var metricsString = metricsStrings.join('\n');
        var parsedMetrics = promToMetrics({
            output: metricsString
        });

        if (parsedMetrics instanceof Error) {
            callback(parsedMetrics);
            return;
        }

        callback(null, parsedMetrics);
    });
};

TritonCoreCollector.prototype.cacheTTL = function cacheTTL() {
    return (TRITON_CORE_TTL);
};

module.exports = TritonCoreCollector;
