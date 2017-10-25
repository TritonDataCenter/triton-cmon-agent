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
var mod_jsprim = require('jsprim');

var GZ_ZONE_ID = 0;
var METRIC_TTL = 10;


//
// This function loops through each of the kstats defined in opts.kstatMap and
// adds a metric object for each by taking data from opts.kstatsObj.data which
// is a single object from the array returned by kstat reader.
//
// If there are metrics defined in opts.kstatMap that are not in the
// opts.kstatsObj.data, the names of these (with an index prefix) will be added
// to the opts.missingMetrics array.
//
// It also uses opts.seenMetricKeys to ensure that for a given set of kstats
// objects, we don't have duplicate keys.
//
function loadMetrics(opts) {
    mod_assert.object(opts, 'opts');

    // input opts
    mod_assert.number(opts.kstatIdx, 'opts.kstatIdx');
    mod_assert.optionalFunc(opts.kstatLabeler, 'opts.kstatLabeler');
    mod_assert.object(opts.kstatMap, 'opts.kstatMap');
    mod_assert.object(opts.kstatsObj, 'opts.kstatsObj');
    mod_assert.object(opts.kstatsObj.data, 'opts.kstatsObj.data');

    // output / state opts
    mod_assert.array(opts.foundMetrics, 'opts.foundMetrics');
    mod_assert.array(opts.missingMetrics, 'opts.missingMetrics');
    mod_assert.object(opts.seenMetricKeys, 'opts.seenMetricKeys');

    var idx;
    var kstatInfo;
    var kstatValue;
    var labeledKey;
    var metric;
    var metricKey;
    var metricLabel;

    for (idx = 0; idx < opts.kstatMap.length; idx++) {
        kstatInfo = opts.kstatMap[idx];
        kstatValue = opts.kstatsObj.data[kstatInfo.kstat_key];

        if (kstatValue === undefined) {
            opts.missingMetrics.push(opts.kstatIdx + '.' + kstatInfo.kstat_key);
            continue;
        }

        if (kstatInfo.modifier !== undefined) {
            kstatValue = kstatInfo.modifier(kstatValue);
        }

        metricKey = kstatInfo.key;
        metricLabel = '';
        if (opts.kstatLabeler !== undefined) {
            metricLabel = '{' + opts.kstatLabeler(opts.kstatsObj) + '}';
        }
        labeledKey = metricKey + metricLabel;

        // ensure we don't have duplicate metrics (at least with the same label)
        mod_assert.ok(!opts.seenMetricKeys.hasOwnProperty(labeledKey),
            'should not have duplicate metric: ' + labeledKey);
        opts.seenMetricKeys[labeledKey] = true;

        metric = {
            help: kstatInfo.help,
            key: metricKey,
            type: kstatInfo.type,
            value: kstatValue.toString()
        };

        if (metricLabel !== '') {
            metric.label = metricLabel;
        }

        opts.foundMetrics.push(metric);
    }
}

//
// This function reads kstats from the supplied opts.kstatReader and then feeds
// each of the returned kstat objects through the loadMetrics function in order
// to load the data into the foundMetrics array. The resulting array of metrics
// objects is then passed to the callback as the second argument.
//
// On error an Error object will be passed as the first argument to the callback
// and the second argument should be ignored.
//
function kstatsToMetrics(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatMap, 'opts.kstatMap');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');
    mod_assert.object(opts.kstatReadOpts, 'opts.kstatReadOpts');
    mod_assert.optionalFunc(opts.kstatFilter, 'opts.kstatFilter');
    mod_assert.func(callback, 'callback');

    var foundMetrics = [];
    var idx;
    var kstatsArray;
    var missingMetrics = [];
    var seenMetricKeys = {};

    kstatsArray = opts.kstatReader.read(opts.kstatReadOpts);

    // Sanity check, sort & optionally filter the results from kstat reader
    mod_assert.array(kstatsArray, 'kstatsArray');
    if (opts.kstatFilter !== undefined) {
        kstatsArray = kstatsArray.filter(opts.kstatFilter);
    }
    kstatsArray = kstatsArray.sort(function _sortKstats(a, b) {
        if (a.name < b.name) {
            return -1;
        } else if (a.name > b.name) {
            return 1;
        } else {
            return 0;
        }
    });

    if (kstatsArray.length > 1) {
        // If we have multiple entries for a single kstat, we need to have some
        // way to distinguish the two. We do that here with labels. So when
        // there are more than 1 result we require a labeler which takes a stat
        // object and returns a keys=value string label.
        mod_assert.func(opts.kstatLabeler, 'opts.kstatLabeler');
    }

    for (idx = 0; idx < kstatsArray.length; idx++) {
        loadMetrics({
            // input
            kstatIdx: idx,
            kstatLabeler: opts.kstatLabeler,
            kstatMap: opts.kstatMap,
            kstatsObj: kstatsArray[idx],

            // output / state
            foundMetrics: foundMetrics,
            missingMetrics: missingMetrics,
            seenMetricKeys: seenMetricKeys
        });
    }

    if (missingMetrics.length > 0) {
        callback(new Error('unable to retrieve kstat values (' +
            JSON.stringify(opts.kstatReaderOpts) + '): ' +
            missingMetrics.join(',')));
        return;
    }

    callback(null, foundMetrics);
}

/*
 * This takes the opts that were passed to getMetrics and returns the set of
 * options to actually search the kstats with. It replaces the value for the
 * special key:
 *
 *     instance: '<instanceId>'
 *
 * with the actual instance id. And if there's an '<instanceId>' in the name
 * field:
 *
 *     name: 'whatever_<instanceId>'
 *
 * we replace that with the instance id as well.
 */
function kstatReadOpts(getMetricsOpts, readOpts) {
    var newOpts;

    newOpts = mod_jsprim.deepCopy(readOpts);

    if (newOpts.instance === '<instanceId>') {
        newOpts.instance = getMetricsOpts.instanceId;
    }

    if (newOpts.hasOwnProperty('name')) {
        /* BEGIN JSSTYLED */
        newOpts.name =
            newOpts.name.replace(/<instanceId>/, getMetricsOpts.instanceId);
        /* END JSSTYLED */
    }

    return (newOpts);
}

module.exports = {
    GZ_ZONE_ID: GZ_ZONE_ID,
    kstatReadOpts: kstatReadOpts,
    kstatsToMetrics: kstatsToMetrics,
    METRIC_TTL: METRIC_TTL
};
