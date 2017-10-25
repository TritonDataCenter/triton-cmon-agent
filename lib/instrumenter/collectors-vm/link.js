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

var kstat_common = require('../lib/kstat-common');

var LINK_READ_OPTS = {
    'class': 'net',
    module: 'link'
};

var LINK_KSTATS = [
    {
        kstat_key: 'ipackets64',
        key: 'net_agg_packets_in',
        type: 'counter',
        help: 'Aggregate inbound packets'
    },
    {
        kstat_key: 'obytes64',
        key: 'net_agg_bytes_out',
        type: 'counter',
        help: 'Aggregate outbound bytes'
    },
    {
        kstat_key: 'opackets64',
        key: 'net_agg_packets_out',
        type: 'counter',
        help: 'Aggregate outbound packets'
    },
    {
        kstat_key: 'rbytes64',
        key: 'net_agg_bytes_in',
        type: 'counter',
        help: 'Aggregate inbound bytes'
    }
];


function LinkMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.kstatReader = opts.kstatReader;
    self.kstatReadOpts = LINK_READ_OPTS;
}

LinkMetricCollector.prototype.getMetrics = function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.uuid(opts.zonename, 'opts.zonename');
    mod_assert.func(callback, 'callback');

    var readOpts = kstat_common.kstatReadOpts(opts, self.kstatReadOpts);

    kstat_common.kstatsToMetrics({
        kstatFilter: function _filterLinks(linkKstat) {
            if (linkKstat.data !== undefined &&
                linkKstat.data.zonename === opts.zonename) {

                return true;
            }

            return false;
        },
        kstatLabeler: function _labelLink(linkKstat) {
            /* eslint-disable */
            /* BEGIN JSSTYLED */
            //
            // We know the link names will look like:
            //
            //   z<integer>_<linkname>
            //
            // because of: https://github.com/joyent/illumos-joyent/blob/release-20170928/usr/src/uts/common/io/dls/dls_mgmt.c#L784
            //
            // And because of:
            //
            //   https://github.com/joyent/illumos-joyent/blob/release-20170928/usr/src/cmd/dlmgmtd/dlmgmt_util.c#L701
            //
            // we're assuming the linkname is always:
            //
            //   <prefix><integer PPA>
            //
            // So here we'll strip everything but the PPA off and prefix with
            // vnic since the zoneid will change, and the prefix will be
            // different between LX and SmartOS and normalizing the two into
            // vnicX will make it much easier for users to query without
            // conditionals.
            //
            /* END JSSTYLED */
            /* eslint-enable */
            var iface;
            var label = linkKstat.name;

            iface = label.replace(/^z\d+_[^\d]+/, 'vnic');
            return ('interface="' + iface + '"');
        },
        kstatMap: LINK_KSTATS,
        kstatReader: self.kstatReader,
        kstatReadOpts: readOpts
    }, callback);
};

LinkMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (kstat_common.METRIC_TTL);
};

module.exports = LinkMetricCollector;
