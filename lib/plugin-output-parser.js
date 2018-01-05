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

function PluginOutputParser(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.log, 'opts.log');

    self.log = opts.log;
}

function logSafeLine(line) {
    // For now, the only thing we do to make this "safe for logs" is trim it to
    // 1KiB. If we want to do something else in the future, we can add that
    // here.
    return (line.substr(0, 1024));
}

function lineToMetrics(line, opts, metrics) {
    mod_assert.string(line, 'line');
    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.prefix, 'opts.prefix');
    mod_assert.array(metrics, 'metrics');

    var chunks;
    var help;
    var label;
    var matches;
    var name;
    var type;
    var value;

    chunks = line.split(/\t/);

    if (chunks.length < 3 || chunks.length > 4) {
        return (new Error('unable to parse line: [' + logSafeLine(line) + ']'));
    }

    // name \t type \t value [\t help]
    name = chunks[0];
    type = chunks[1];
    value = chunks[2];

    if (chunks.length === 4) {
        help = chunks[3];
    } else {
        // just use the name as the help text
        help = chunks[1];
    }

    // If name has a label (e.g. net_agg_bytes_out{interface="vnic0"}), split
    // that off and add it as 'label' to the metric object.
    /* JSSTYLED */
    matches = name.match(/^([^\{]+)(\{.*=.*\})$/);
    if (matches) {
        name = matches[1];
        label = matches[2];
    }

    if (['counter', 'gauge', 'option'].indexOf(type) === -1) {
        return (new Error('invalid type on line: [' + logSafeLine(line) + ']'));
    }

    if (type !== 'option') {
        name = opts.prefix + name;
    }

    // Metric name validation matches:
    // https://github.com/prometheus/client_java/issues/28
    if (!name.match(/^[a-zA-Z_:]([a-zA-Z0-9_:])*$/)) {
        return (new Error('invalid name: [' + logSafeLine(name) + ']'));
    }

    // Validate value is at least a number.
    if (isNaN(Number(value))) {
        return (new Error('invalid value: [' + logSafeLine(value) + ']'));
    }

    // Note: We don't currently validate help text, as it's not used
    // programatically anywhere.

    metrics.push({
        help: help,
        key: name,
        label: label,
        type: type,
        value: value
    });
}

PluginOutputParser.prototype.parse = function parse(opts, callback) {
    var err;
    var line;
    var lineIdx;
    var lines;
    var metrics = [];

    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.prefix, 'opts.prefix');
    mod_assert.string(opts.output, 'opts.output');
    mod_assert.func(callback, 'callback');

    lines = opts.output.split('\n');
    for (lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        line = lines[lineIdx].trim();

        if (line.length === 0) {
            // ignore blank lines entirely
            continue;
        }

        err = lineToMetrics(line, {prefix: opts.prefix}, metrics);
        if (err) {
            // on bad output, we bail on this plugin
            callback(err);
            return;
        }
    }

    // callback() will be called with parseErr, metrics
    callback(null, metrics);
};

module.exports = PluginOutputParser;
