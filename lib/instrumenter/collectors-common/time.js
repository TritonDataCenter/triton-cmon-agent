/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

'use strict';
var mod_assert = require('assert-plus');

var METRIC_TEMPLATE = {
    help: 'System time in seconds since epoch',
    key: 'time_of_day',
    type: 'counter'
};

// There's no point caching the current time, we're assuming -1 means no-cache.
var METRIC_TTL = -1;

function TimeMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.func(opts.getCurrentTimestamp, 'opts.getCurrentTimestamp');

    self.getCurrentTimestamp = opts.getCurrentTimestamp;
}

TimeMetricCollector.prototype.getMetrics = function getMetrics(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.func(callback, 'callback');

    var self = this;
    var tmetrics = [];

    tmetrics.push({
        help: METRIC_TEMPLATE.help,
        key: METRIC_TEMPLATE.key,
        type: METRIC_TEMPLATE.type,
        value: self.getCurrentTimestamp().toString()
    });

    callback(null, tmetrics);
};

TimeMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (METRIC_TTL);
};

module.exports = TimeMetricCollector;
