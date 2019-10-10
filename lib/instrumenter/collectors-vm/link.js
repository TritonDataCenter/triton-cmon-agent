/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

'use strict';
var mod_assert = require('assert-plus');
var mod_http = require('http');

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

/*
 * Because this is a latency-sensitive code path, we can't pay the
 * price of forking a new process to run `vmadm get <:instance_uuid>`.
 * Instead, we invoke vminfod local HTTP API --  which has not been
 * stabilized yet -- to retrieve the instance information.
 */
function getInstanceNicsInfo(instanceUuid, cb) {
    mod_http.get('http://127.0.0.1:9090/vms/' + instanceUuid,
        function _gotHttpResp(res) {
        if (res.statusCode !== 200) {
            cb(new Error('Failed to retrieve instance info from vminfod ' +
                'Status Code: ' + res.statusCode));
            return;
        }
        var vmInfo = '';
        res.on('data', function _onData(chunk) {
            vmInfo += chunk;
        });
        res.on('end', function _onEnd() {
            try {
                var nics = JSON.parse(vmInfo).nics || [];
                cb(null, nics);
            } catch (_e) {
                cb(new Error('Invalid payload received from vminfod: ' +
                    vmInfo));
            }
        });
    }).on('error', function _onErr(err) {
        cb(err);
    });
}

function LinkMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.kstatReader, 'opts.kstatReader');

    self.log = opts.log;
    self.kstatReader = opts.kstatReader;
    self.kstatReadOpts = LINK_READ_OPTS;
}

LinkMetricCollector.prototype.getMetrics = function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.zInfo, 'opts.zInfo');
    mod_assert.uuid(opts.zInfo.zonename, 'opts.zInfo.zonename');
    mod_assert.func(callback, 'callback');

    var readOpts = kstat_common.kstatReadOpts(opts.zInfo, self.kstatReadOpts);

    getInstanceNicsInfo(opts.zInfo.zonename,
        function _gotInstanceNicsInfo(err, nics) {
        if (err) {
            self.log.warn('Failed to retreive nics info from vminfod' + err);
            nics = [];
        }

        kstat_common.kstatsToMetrics({
            kstatFilter: function _filterLinks(linkKstat) {
                if (linkKstat.data !== undefined &&
                    linkKstat.data.zonename === opts.zInfo.zonename) {

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
                var nicName = linkKstat.name.replace(/^z\d+_/, '');
                var ifaceName = linkKstat.name.replace(/^z\d+_[^\d]+/, 'vnic');
                var labels = 'interface="' + ifaceName + '"';
                nics.some(function _checkNic(nic) {
                    if (nic.interface === nicName) {
                        labels += ',nic_tag="' + nic.nic_tag + '",' +
                            'network_uuid="' + nic.network_uuid + '"';
                        return true;
                    }
                    return false;
                });

                return (labels);
            },
            kstatMap: LINK_KSTATS,
            kstatReader: self.kstatReader,
            kstatReadOpts: readOpts
        }, callback);
    });
};

LinkMetricCollector.prototype.cacheTTL = function cacheTTL() {
    /*
     * XXX: Since these metrics are cached for 10 seconds, we should not
     * be hitting vminfod very often. If hitting vminfod becomes an issue,
     * we can consider caching nics information somewhere.
     */
    return (kstat_common.METRIC_TTL);
};

module.exports = LinkMetricCollector;
