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
        help = chunks[0];
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

function parseTabSeparated(opts, callback) {
    var err;
    var line;
    var lineIdx;
    var lines;
    var metrics = [];

    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.output, 'opts.output');
    mod_assert.string(opts.prefix, 'opts.prefix');
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
}

// If there are options, they must precede all Prometheus formatted lines.
// This function assumes that each metric starts with a line starting with
// "# HELP" followed by a line starting with "# TYPE".
// Ex:
// # OPTION ttl 30
// # HELP http_requests_completed count of requests completed
// # TYPE http_requests_completed counter
// http_requests_completed{route="ping"} 10
function parsePrometheus(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.output, 'opts.output');
    mod_assert.string(opts.prefix, 'opts.prefix');
    mod_assert.func(callback, 'callback');

    var idx;
    var metrics = [];
    var metricsString = opts.output;

    var lines = metricsString.split('\n');
    var optionsChecked = false;
    var parsingValues = false;
    var currentMetric = {format: 'prom', value: ''};
    for (idx = 0; idx < lines.length; idx++) {
        var line = lines[idx];

        if (line.length === 0) {
            continue;
        }

        if (optionsChecked === false) {
            if (line.startsWith('# OPTION')) {
                // # OPTION <name> <value>
                var optionTokens = line.split(' ');
                var optionName = optionTokens[2];
                var value = optionTokens[3];

                // Validate value is at least a number.
                if (isNaN(Number(value))) {
                    return callback(new Error('invalid value: [' +
                        logSafeLine(value) +
                        ']'));
                }

                metrics.push({
                    key: optionName,
                    type: 'option',
                    value: value
                });
                continue;
            } else {
                optionsChecked = true;
            }
        }

        // If we're parsing the values of a metric and the
        // next line starts with "# ", we assume that this
        // is the first metadata line of the next metric.
        if (line.startsWith('# ') && parsingValues === true) {
            if (!currentMetric.type) {
                return callback(new Error(
                    'Metric is missing "# TYPE" line'));
            }

            // If there's no "# HELP" line, set help
            // to the metric name without the plugin prefix
            if (!currentMetric.help) {
                currentMetric.help = currentMetric.key
                    .substring(opts.prefix.length);
            }

            parsingValues = false;
            metrics.push(currentMetric);
            currentMetric = {format: 'prom', value: ''};
        }

        if (line.startsWith('# HELP')) {
            // # HELP <name> <help text>
            var help = line.split(' ').slice(3).join(' ');
            currentMetric.help = help;
        } else if (line.startsWith('# TYPE')) {
            // # TYPE <name> <type>
            var typeTokens = line.split(' ');
            var name = opts.prefix + typeTokens[2];
            var type = typeTokens[3];

            if (['counter', 'gauge', 'histogram']
                .indexOf(type) === -1) {
                return callback(new Error('invalid type on line: [' +
                    logSafeLine(line) +
                    ']'));
            }

            // Metric name validation matches:
            // https://github.com/prometheus/client_java/issues/28
            if (!name.match(/^[a-zA-Z_:]([a-zA-Z0-9_:])*$/)) {
                return callback(new Error('invalid name: [' +
                    logSafeLine(name) +
                    ']'));
            }

            currentMetric.key = name;
            currentMetric.type = type;
        } else {
            parsingValues = true;
            currentMetric.value += line;
            currentMetric.value += '\n';
        }
    }

    // Handles invalid metrics at the end of the plugin output
    // Example:
    // # HELP help text
    // or
    // # HELP help text
    // http_request_count 10
    if (!currentMetric.type &&
        (currentMetric.value !== '' || currentMetric.help)) {
        return callback(new Error('Metric is missing "# TYPE" line'));
    } else if (currentMetric.type) {
        // If there's no "# HELP" line, set help
        // to the metric name without the plugin prefix
        if (!currentMetric.help) {
            currentMetric.help = currentMetric.key
                .substring(opts.prefix.length);
        }

        metrics.push(currentMetric);
    }

    callback(null, metrics);
}

PluginOutputParser.prototype.parse = function parse(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.path, 'opts.path');
    mod_assert.string(opts.prefix, 'opts.prefix');
    mod_assert.string(opts.output, 'opts.output');
    mod_assert.func(callback, 'callback');

    var promRe = new RegExp('.prom');
    if (promRe.test(opts.path)) {
        parsePrometheus(opts, callback);
    } else {
        parseTabSeparated(opts, callback);
    }
};

module.exports = PluginOutputParser;
