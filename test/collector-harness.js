/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/* Test the Metric Agent endpoints */
'use strict';
var mod_assert = require('assert-plus');
var mod_bunyan = require('bunyan');

var lib_instrumenterCollector = require('../lib/instrumenter/collector');

var log = mod_bunyan.createLogger({
    name: 'collector_test',
    level: process.env['LOG_LEVEL'] || 'error',
    stream: process.stderr
});

function mockCurrentTimestamp() {
    var self = this; // eslint-disable-line

    mod_assert.object(self.mockData, 'self.mockData');
    mod_assert.number(self.mockData.timestamp, 'self.mockData.timestamp');

    return (self.mockData.timestamp);
}

function mockKstatReader(opts) {
    var self = this; // eslint-disable-line

    mod_assert.object(self.mockData, 'self.mockData');
    mod_assert.arrayOfObject(self.mockData.kstats, 'self.mockData.kstats');

    var expectedOpts = Object.keys(opts);

    // return an array of kstats that match the request
    return (self.mockData.kstats.filter(function _filterKstats(kstatObj) {
        var idx;
        var field;

        for (idx = 0; idx < expectedOpts.length; idx++) {
            field = expectedOpts[idx];
            if (kstatObj[field] !== opts[field]) {
                return false;
            }
        }

        return true;
    }));
}

function mockNtpData(callback) {
    var self = this; // eslint-disable-line

    mod_assert.object(self.mockData, 'self.mockData');

    if (!self.mockData.hasOwnProperty('ntp')) {
        // no data, return an empty object
        callback(null, {});
        return;
    }

    callback(null, self.mockData.ntp);
}

// Dummy, since this endpoint is a NO-OP.
function mockRefreshZoneCache(callback) {
    callback();
}

function mockZfsUsage(vm_uuid, callback) {
    var self = this; // eslint-disable-line

    mod_assert.object(self.mockData, 'self.mockData');
    mod_assert.object(self.mockData.vms, 'self.mockData.vms');
    mod_assert.object(self.mockData.vms[vm_uuid],
        'self.mockData.vms.' + vm_uuid);
    mod_assert.object(self.mockData.vms[vm_uuid].zfs,
        'self.mockData.vms.' + vm_uuid + '.zfs');
    mod_assert.number(self.mockData.vms[vm_uuid].zfs.avail,
        'self.mockData.vms.' + vm_uuid + '.zfs.avail');
    mod_assert.number(self.mockData.vms[vm_uuid].zfs.used,
        'self.mockData.vms.' + vm_uuid + '.zfs.used');

    callback(null, self.mockData.vms[vm_uuid].zfs);
}

function filterCollectors(mockCollector, enabledCollectors) {
    var col;
    var colIdx;
    var colKeys;
    var type;
    var typeIdx;
    var typeKeys;

    // Strip down to just the collectors in enabledCollectors by looping through
    // all loaded collectors and deleting any that are not also in
    // enabledCollectors.
    typeKeys = Object.keys(mockCollector.collectors);
    for (typeIdx = 0; typeIdx < typeKeys.length; typeIdx++) {
        type = typeKeys[typeIdx];
        if (enabledCollectors.hasOwnProperty(type)) {
            colKeys = Object.keys(mockCollector.collectors[type]);

            for (colIdx = 0; colIdx < colKeys.length; colIdx++) {
                col = colKeys[colIdx];

                if (!enabledCollectors[type].hasOwnProperty(col)) {
                    delete mockCollector.collectors[type][col];
                }
            }
        } else {
            delete mockCollector.collectors[type];
        }
    }

    // Ensure that all collectors that were specified in enabledCollectors
    // actually existed. Mostly to prevent programmer errors in tests.
    typeKeys = Object.keys(enabledCollectors);
    for (typeIdx = 0; typeIdx < typeKeys.length; typeIdx++) {
        type = typeKeys[typeIdx];
        mod_assert.object(mockCollector.collectors[type],
            'mockCollector.collectors[' + type + ']');

        colKeys = Object.keys(enabledCollectors[type]);
        for (colIdx = 0; colIdx < colKeys.length; colIdx++) {
            col = colKeys[colIdx];

           mod_assert.object(mockCollector.collectors[type][col],
                'mockCollector.collectors[' + type + '][' + col + ']');
        }
    }
}

/*
 * This mock collector has 2 modes.
 *
 *  1) A mode in which you pass in a data object that contains all the data that
 *     would be loaded from the system. This allows one to run collectors with a
 *     known set of data to ensure that the getMetrics results are as expected.
 *     To use this mode, one passes in a 'mockData' option the format of which
 *     is described below.
 *
 *  2) A mode in which you use all the actual collectors, collecting data from
 *     the local system. This mode is useful for testing that the collectors
 *     grab data from the system in the correct form. To use this one needs to
 *     *not* pass a 'mockData' option.
 *
 * If passed, the mockData option should be an object that looks like:
 *
 *    {
 *        kstats: [
 *            {
 *                class: '<class>',
 *                module: '<module>',
 *                ...
 *                data: {
 *                    <key>: <value>,
 *                    <key>: <value>
 *                }
 *           },
 *           ...
 *        ],
 *        ntp: {
 *            peers: {
 *                ...
 *            },
 *            syspeer: {
 *                ...
 *            },
 *            system: {
 *                ...
 *            }
 *        },
 *        timestamp: <timestamp: integer in seconds>,
 *        vms: {
 *            '<VM uuid>': {
 *                instance: <integer>,
 *                zfs: {
 *                    avail: <integer number of bytes>,
 *                    used: <integer number of bytes>
 *                }
 *            }, ...
 *        }
 *    }
 *
 * though top-level keys may be omitted as appropriate. You can then also modify
 * your object between calls to collector.getMetrics() to perform tests on
 * changing values.
 *
 * In addition to the 'mockData' option, it is possible to pass a
 * 'enabledCollectors' option which filters which collectors are enabled
 * which allows you to restrict to just the collectors you want to test.
 *
 * FUTURE:
 *
 *  - In the future we could add options where you could replace the component
 *    functions (like replacing collector.getCurrentTimestamp() with a version
 *    that just monotonically increments) if this seems useful.
 *
 */
function createCollector(opts, callback) {
    mod_assert.optionalObject(opts.enabledCollectors, 'opts.enabledCollectors');
    mod_assert.optionalObject(opts.mockData, 'opts.mockData');

    var haveVmKstats = {};
    var kIdx;
    var kstats;
    var mockCollector;

    mockCollector = new lib_instrumenterCollector({ log: log });

    if (opts.mockData) {
        mockCollector.refreshZoneCache =
            mockRefreshZoneCache.bind(mockCollector);
        mockCollector.getCurrentTimestamp =
            mockCurrentTimestamp.bind(mockCollector);
        mockCollector.getNtpData = mockNtpData.bind(mockCollector);
        mockCollector.getZfsUsage = mockZfsUsage.bind(mockCollector);
        mockCollector.reader = {
            read: mockKstatReader.bind(mockCollector)
        };

        mockCollector.mockData = opts.mockData;

        /*
         * Because we use the kstats to determine whether a VM exists, if
         * we've specified VMs but haven't provided kstat data, we'll fill
         * in some fake data here.
         */
        if (mockCollector.mockData.kstats === undefined) {
            mockCollector.mockData.kstats = [];
        }


        // Fill in only the fields of the kstat we need.
        if (mockCollector.mockData.vms) {

            // Make a map of the VMs we have zone_misc kstats for
            kstats = mockCollector.mockData.kstats;
            for (kIdx = 0; kIdx < kstats.length; kIdx++) {
                if (kstats[kIdx]['class'] === 'zone_misc' &&
                    kstats[kIdx].module === 'zones') {

                    haveVmKstats[kstats[kIdx].data.zonename] = true;
                }
            }

            Object.keys(mockCollector.mockData.vms).forEach(
                function _mockKey(k) {

                if (!haveVmKstats[k]) {
                    mockCollector.mockData.kstats.push({
                        'class': 'zone_misc',
                        data: {
                            zonename: k
                        },
                        instance: mockCollector.mockData.vms[k].instance,
                        module: 'zones',
                        name: k.substr(0, 30)
                    });
                }
            });
        }

    }

    mockCollector.start(function _startedCollector() {
        if (opts.hasOwnProperty('enabledCollectors')) {
            filterCollectors(mockCollector, opts.enabledCollectors);
        }

        callback(mockCollector);
    });
}

module.exports = {
    createCollector: createCollector
};
