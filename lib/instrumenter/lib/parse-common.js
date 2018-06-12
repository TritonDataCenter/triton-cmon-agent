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

var parseInteger = require('jsprim').parseInteger;

function logSafeLine(line) {
    // For now, the only thing we do to make this "safe for logs" is trim it to
    // 1KiB. If we want to do something else in the future, we can add that
    // here.
    if (line) {
        return (line.substr(0, 1024));
    }

    return line;
}

function promToMetrics(opts) {
    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.output, 'opts.output');
    mod_assert.optionalString(opts.prefix, 'opts.prefix');

    var idx;
    var metrics = [];
    var prefix = opts.prefix || '';

    var lines = opts.output.split('\n');
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

                // Validate value is an integer
                if (!value || parseInteger(value) instanceof Error) {
                    return new Error('invalid value: [' +
                        logSafeLine(value) +
                        ']');
                }

                // The only valid option is ttl
                if (optionName !== 'ttl') {
                    return new Error('invalid option: [' +
                        logSafeLine(optionName) +
                        ']');
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
                return new Error(
                    'Metric is missing "# TYPE" line');
            }

            // If there's no "# HELP" line, set help
            // to the metric name without the plugin prefix
            if (!currentMetric.help) {
                currentMetric.help = currentMetric.key
                    .substring(prefix.length);
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
            var name = [prefix, typeTokens[2]].join('');
            var type = typeTokens[3];

            if (['counter', 'gauge', 'histogram']
                .indexOf(type) === -1) {
                return new Error('invalid type on line: [' +
                    logSafeLine(line) +
                    ']');
            }

            // Metric name validation matches:
            // https://github.com/prometheus/client_java/issues/28
            if (!name.match(/^[a-zA-Z_:]([a-zA-Z0-9_:])*$/)) {
                return new Error('invalid name: [' +
                    logSafeLine(name) +
                    ']');
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
        return new Error('Metric is missing "# TYPE" line');
    } else if (currentMetric.type) {
        // If there's no "# HELP" line, set help
        // to the metric name without the plugin prefix
        if (!currentMetric.help) {
            currentMetric.help = currentMetric.key
                .substring(prefix.length);
        }

        metrics.push(currentMetric);
    }

    return metrics;
}


module.exports = {
    promToMetrics: promToMetrics,
    logSafeLine: logSafeLine
};
