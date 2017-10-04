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

var GZ_ZONE_ID = 0;
var METRIC_TTL = 10;

function kstatsToMetrics(opts, callback) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatMap, 'opts.kstatMap');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');
    mod_assert.object(opts.kstatReadOpts, 'opts.kstatReadOpts');
    mod_assert.optionalFunc(opts.kstatFilter, 'opts.kstatFilter');
    mod_assert.func(callback, 'callback');

    var idx;
    var kstatInfo;
    var kstats;
    var kstatsArray;
    var kstatValue;
    var missingKstats = [];
    var tmetrics = [];

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

    console.error('KSTATS: ' + JSON.stringify(kstatsArray, null, 2));

    // XXX
    //     For things like links, we could have multiple entries here, so we
    //     need some mechanism to distinguish the instances. One method might
    //     be to treat the entries separately and instead of:
    //
    //     net_agg_bytes_out
    //
    //     use the key:
    //
    //     net0_agg_bytes_out
    //
    //     where net0 comes from the "name" ("z21_net0") after we trim off the
    //     z21_ zoneid prefix. In which case we could use {{name}} in the
    //     kstatInfo.key and replace that with the name minus any z\d\d_ prefix.
    //
    //     In the meantime, we're just sorting by name and taking the first.
    //
    // mod_assert.equal(kstatsArray.length, 1, 'expected 1 row from kstat reader');
    mod_assert.object(kstatsArray[0].data, 'kstatsArray[0].data');

    kstats = kstatsArray[0];

    for (idx = 0; idx < opts.kstatMap.length; idx++) {
        kstatInfo = opts.kstatMap[idx];
        kstatValue = kstats.data[kstatInfo.kstat_key];

        if (kstatValue === undefined) {
            missingKstats.push(kstatInfo.kstat_key);
            continue;
        }

        if (kstatInfo.modifier) {
            kstatValue = kstatInfo.modifier(kstatValue);
        }

        tmetrics.push({
            help: kstatInfo.help,
            key: kstatInfo.key,
            type: kstatInfo.type,
            value: kstatValue.toString()
        });

        // TODO Do we generally care about stuff outside data? such as:
        //
        // {
        //     "class": "misc",
        //     "module": "zfs",
        //     "name": "arcstats",
        //     "instance": 0,
        //     "snaptime": 233074180447391,
        //     "crtime": 19580159684,
        //
    }

    if (missingKstats.length > 0) {
        callback(new Error('unable to retrieve kstat values (' +
            JSON.stringify(opts.kstatReaderOpts) + '): ' +
            missingKstats.join(',')));
        return;
    }

    callback(null, tmetrics);
}

module.exports = {
    GZ_ZONE_ID: GZ_ZONE_ID,
    kstatsToMetrics: kstatsToMetrics,
    METRIC_TTL: METRIC_TTL
};
