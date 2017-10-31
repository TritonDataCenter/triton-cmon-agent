/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/*
 * The primary way for most things to interact with this module is through
 * calling getNtpData(). E.g.:
 *
 *    var lib_ntp = require('lib/ntp');
 *
 *    lib_ntp.getNtpData(function _onData(err, ntpData) {
 *        // check err, then handle ntpData here
 *    });
 *
 * which will either result in an error (err), or an ntpData structure which
 * contains the data as follows:
 *
 * {
 *     peers: {
 *         // peer info
 *     },
 *     syspeer: {
 *         // syspeer info
 *     },
 *     system: {
 *         // system info
 *     }
 *
 * Note: All values except:
 *
 *     "state" for each peer (value will be a string like 'candidate')
 *     kernel_status (value will be string like 'pll')
 *     system_peer_mode (value will be a string like 'client')
 *
 * will be javascript numbers. See lib/instrumenter/collectors-gz/ntp.js for
 * examples of possible values for these fields.
 *
 */

'use strict';

var mod_assert = require('assert-plus');
var mod_vasync = require('vasync');
var mod_verror = require('verror');

var forkExecWait = require('forkexec').forkExecWait;


/* eslint-disable */
/* BEGIN JSSTYLED */
var PEER_HEADER_1 = '     remote       refid   assid  st t when poll reach   delay   offset  jitter';
var PEER_HEADER_2 = '==============================================================================';
/* END JSSTYLED */
/* eslint-enable */
var PEER_REGEXP = new RegExp(
    '^(.)([0-9a-zA-Z\.\_\-]+)\\s+' + // flash + remote
    '([a-zA-Z0-9\.]+)\\s+' +         // refid
    '([0-9]+)\\s+' +                 // assid
    '([0-9]+)\\s+' +                 // st
    '([a-zA-Z])\\s+' +               // t
    '([0-9\-]+[mhd]?)\\s+' +         // when
    '([0-9]+)\\s+' +                 // poll
    '([0-9]+)\\s+' +                 // reach
    '([0-9\.\-]+)\\s+' +             // delay
    '([0-9\.\-]+)\\s+' +             // offset
    '([0-9\.\-]+)'                   // jitter
);
var NTP_IGNORE_PROPERTIES = [
    'reference ID',
    'system peer'
];
var NTP_NUMBER_PROPERTIES = {
    'addresses': 'addresses',
    'authentication failed': 'authentication_failed',
    'bad length or format': 'bad_length_or_format',
    'broadcast delay': 'broadcast_delay',
    'calibration cycles': 'calibration_cycles',
    'calibration errors': 'calibration_errors',
    'calibration interval': 'calibration_interval',
    'calls to transmit': 'calls_to_transmit',
    'clock jitter': 'clock_jitter',
    'clock wander': 'clock_wander',
    'current version': 'current_version',
    'declined': 'declined',
    'delay': 'delay',
    'dispersion': 'dispersion',
    'dropped packets': 'dropped_packets',
    'enabled': 'enabled',
    'estimated error': 'estimated_error',
    'free receive buffers': 'free_receive_buffers',
    'frequency tolerance': 'frequency_tolerance',
    'headway': 'headway',
    'hmode': 'hmode',
    'hpoll': 'hpoll',
    'ignored packets': 'ignored_packets',
    'input wakeups': 'input_wakeups',
    'jitter exceeded': 'jitter_exceeded',
    'jitter': 'jitter',
    'keyid': 'keyid',
    'kilobytes': 'kilobytes',
    'KoD responses': 'kod_responses',
    'leap': 'leap_indicator',
    'log2 precision': 'log2_precision',
    'low water refills': 'low_water_refills',
    'maximum addresses': 'maximum_addresses',
    'maximum error': 'maximum_error',
    'maximum kilobytes': 'maximum_kilobytes',
    'offset': 'offset',
    'older version': 'older_version',
    'packet send failures': 'packet_send_failures',
    'packets received': 'packets_received',
    'packets sent': 'packets_sent',
    'peak addresses': 'peak_addresses',
    'pll frequency': 'pll_frequency',
    'pll offset': 'pll_offset',
    'pll time constant': 'pll_time_constant',
    'pmode': 'pmode',
    'ppoll': 'ppoll',
    'pps frequency': 'pps_frequency',
    'pps jitter': 'pps_jitter',
    'pps stability': 'pps_stability',
    'precision': 'precision',
    'processed for time': 'processed_for_time',
    'rate limited': 'rate_limited',
    'receive buffers': 'receive_buffers',
    'received packets': 'received_packets',
    'reclaim above count': 'reclaim_above_count',
    'reclaim older than': 'reclaim_older_than',
    'restricted': 'restricted',
    'root delay': 'root_delay',
    'root dispersion': 'root_dispersion',
    'rootdelay': 'root_delay',
    'rootdisp': 'root_dispersion',
    'stability exceeded': 'stability_exceeded',
    'stratum': 'stratum',
    'symm. auth. delay': 'symmetric_auth_delay',
    'sysstats reset': 'sysstats_reset',
    'system jitter': 'system_jitter',
    'time since reset': 'time_since_reset',
    'timer overruns': 'timer_overruns',
    'unreach': 'unreach',
    'uptime': 'uptime',
    'used receive buffers': 'used_receive_buffers',
    'useful input wakeups': 'useful_input_wakeups',
    'xleave': 'xleave'
};
var NTP_PEER_STATES = [
    'invalid',      // 0
    'falseticker',  // 1
    'overflow',     // 2
    'pruned',       // 3
    'candidate',    // 4
    'backup',       // 5
    'syspeer',      // 6
    'pps'           // 7
];
var NTPQ = '/usr/sbin/ntpq';


/*
 * Just runs `ntpq [args]` and calls:
 *
 *  callback(err, stdout, stderr);
 *
 * with stdout and stderr being potentially undefined when err is set. This
 * function can be swapped out by a mock when creating a new NtpGetter for
 * testing.
 *
 */
function ntpqCli(args, callback) {
    mod_assert.array(args, 'args');
    mod_assert.func(callback, 'callback');

    forkExecWait({
        'argv': [NTPQ].concat(args)
    }, function _processNtpOutput(err, data) {
        if (err) {
            callback(err);
            return;
        }

        callback(null, data.stdout, data.stderr);
    });
}

/*
 * We create an object here, so that we can test this module separately with a
 * dummy version of the ntpq cli to verify that we're processing things
 * correctly.
 */
function NtpGetter(opts) {
    mod_assert.object(opts, 'opts');
    mod_assert.optionalFunc(opts.ntpqCli, 'opts.ntpqCli');

    var self = this;

    if (opts.ntpqCli === undefined) {
        self.ntpqCli = ntpqCli;
    } else {
        self.ntpqCli = opts.ntpqCli;
    }
}

/*
 * Takes a peer state string (as output from translateFlash) and returns a
 * number.
 */
function peerStateToNumber(value) {
    // will be -1 for 'unknown'
    return (NTP_PEER_STATES.indexOf(value));
}

/*
 * Decodes all the flash characters for version 2 or 3 and translates to a
 * slightly more descriptive string.
 *
 * NOTE: if you change this, you might need to change peerStateToNumber above.
 */
function translateFlash(flash) {
    var translated;

    switch (flash) {
        case ' ':
            /*
             * not valid, e.g. cannot communicate, it's using .LOCL. refid, has
             * high-stratum, it is client of ours, etc.
             */
            translated = 'invalid';
            break;
        case 'x':
            // discarded by the intersection algorithm
            translated = 'falseticker';
            break;
        case '.':
            // discarded due to table overflow
            translated = 'overflow';
            break;
        case '-':
            // discarded by the cluster algorithm
            translated = 'pruned';
            break;
        case '+':
            // included candidate, could be used if current system peer gets
            // discarded
            translated = 'candidate';
            break;
        case '#':
            /*
             * good server for alternate backup (only shown when more than 10
             * remotes)
             */
            translated = 'backup';
            break;
        case '*':
            /*
             * current system peer. This is the remote we're actually
             * synchronizing with currently.
             */
            translated = 'syspeer';
            break;
        case 'o':
            // PPS peer, usually GPS. Should not have both a '*' and 'o' peer.
            translated = 'pps';
            break;
        default:
            translated = 'unknown';
            return;
    }

    return (translated);
}

function addPeer(ntpData, line) {
    mod_assert.object(ntpData, 'ntpData');
    mod_assert.string(line, 'line');

    var matches;
    var peerObj = {};

    matches = line.match(PEER_REGEXP);
    mod_assert.ok(matches, 'peer lines should match ' + PEER_REGEXP.toString() +
        ', got: ' + line);

    peerObj = {
        state: translateFlash(matches[1]),
        remote: matches[2],
        refid: matches[3],
        assid: Number(matches[4]),
        st: Number(matches[5]),
        t: matches[6],
        when: matches[7],
        poll: Number(matches[8]),
        reach: parseInt(matches[9], 8),
        delay: Number(matches[10]),
        offset: Number(matches[11]),
        jitter: Number(matches[12])
    };

    // We know when cannot be empty because of our regexp above, it must start
    // with one of: '-' or 0-9. Then have more of those characters and an
    // optional 'm', 'h', or 'd' suffix.
    if (peerObj.when.length === 1) {
        if (peerObj.when === '-') {
            // special case, no data for when
            peerObj.when = -1;
        }
        // Otherwise, it must be a single digit number already (from regexp)
        peerObj.when = Number(peerObj.when);
    } else {
        // Look at the last character, if it's any of 'm', 'h' or 'd', we
        // convert to minutes, hours or days respectively. Otherwise, it must be
        // a number (because of our regexp).
        switch (peerObj.when[peerObj.when.length - 1]) {
            case 'm':
                peerObj.when =
                    Number(peerObj.when.substr(0, peerObj.when.length - 1));
                peerObj.when *= 60;
                break;
            case 'h':
                peerObj.when =
                    Number(peerObj.when.substr(0, peerObj.when.length - 1));
                peerObj.when *= 60 * 60;
                break;
            case 'd':
                peerObj.when =
                    Number(peerObj.when.substr(0, peerObj.when.length - 1));
                peerObj.when *= 60 * 60 * 24;
                break;
            default:
                peerObj.when = Number(peerObj.when);
                break;
        }
    }

    // Ensure our numbers are numbers.
    mod_assert.number(peerObj.assid, 'peerObj.assid');
    mod_assert.number(peerObj.st, 'peerObj.st');
    mod_assert.number(peerObj.when, 'peerObj.when');
    mod_assert.number(peerObj.poll, 'peerObj.poll');
    mod_assert.number(peerObj.delay, 'peerObj.delay');
    mod_assert.number(peerObj.offset, 'peerObj.offset');
    mod_assert.number(peerObj.jitter, 'peerObj.jitter');

    if (ntpData.peers === undefined) {
        ntpData.peers = {};
    }

    mod_assert.ok(ntpData.peers[peerObj.assid] === undefined,
        'unexpected duplicate peer: ' + peerObj.assid);
    ntpData.peers[peerObj.assid] = peerObj;

    if (peerObj.state === 'syspeer') {
        // this is the system peer, add identifying info to .syspeer
        mod_assert.ok(ntpData.syspeer === undefined,
            'expected only one system peer');
        ntpData.syspeer = {
            assid: peerObj.assid,
            remote: peerObj.remote
            // we'll fill in more of this data later using the output from
            // the `rv <assid>` command.
        };
    }
}

function addProperty(state, ntpData, key, value) {
    mod_assert.object(state, 'state');
    mod_assert.object(ntpData, 'ntpData');
    mod_assert.string(key, 'key');
    mod_assert.ok(value !== undefined, 'value');

    var target;

    if (state.assidContext === 0) {
        if (ntpData.system === undefined) {
            ntpData.system = {};
        }
        target = ntpData.system;
    } else if (ntpData.syspeer !== undefined &&
        state.assidContext === ntpData.syspeer.assid) {

        target = ntpData.syspeer;
    } else {
        mod_assert.ok(false, 'unexpected assid: ' + state.assidContext);
    }

    mod_assert.ok(target[key] === undefined, 'key (' + key +
        ') unexpectedly already exists');

    target[key] = value;
}

function translateTime(timeVal) {
    mod_assert.string(timeVal, 'timeVal');

    var components;
    var decimal;
    var seconds;
    var timeNum;

    mod_assert.ok(/^[a-f0-9]+\.[a-f0-9]+$/.test(timeVal), 'invalid timeVal: ' +
        timeVal);

    components = timeVal.split('.');
    mod_assert.equal(components.length, 2, 'timeVal should have 2 components');

    seconds = parseInt(components[0], 16);
    decimal = parseInt(components[1], 16);

    timeNum = Number(seconds + '.' + decimal);
    mod_assert.number(timeNum, 'timeNum');

    return (timeNum);
}

function addStatLine(state, ntpData, line) {
    var chunks;
    var idx;
    var key;
    var matches;
    var value;

    /* BEGIN JSSTYLED */
    matches = line.match(/^associd=([0-9]+)\s/);
    /* END JSSTYLED */
    if (matches) {
        // If we see a line starting with associd=X, like:
        //
        // associd=0 status=0618 leap_none, sync_ntp, 1 event, no_sys_peer,
        //
        // then we switch contexts to that associd until we see another one.
        // The queries should be ordered so that this will be the case.
        state.assidContext = Number(matches[1]);
        return;
    }

    matches = line.match(/^(.*):\s+(.*)$/);
    if (matches) {
        key = matches[1];
        value = matches[2];

        if (NTP_NUMBER_PROPERTIES[key] !== undefined) {
            // return the result in case it's an error
            return addProperty(state, ntpData, NTP_NUMBER_PROPERTIES[key],
                Number(value));
        } else if (key === 'leap indicator') {
            // leap indicator is a 2-digit binary number
            value = parseInt(value, 2);
            mod_assert.number(value, 'leap_indicator value');
            mod_assert.ok(value >= 0 && value <= 3,
                'expected leap_indicator 0-3');
            return addProperty(state, ntpData, 'leap_indicator', value);
        } else if (key === 'kernel status') {
            // value is a string, typically 'pll'
            return addProperty(state, ntpData, 'kernel_status', value);
        } else if (key === 'system peer mode') {
            // value here is a string, typically 'client'
            return addProperty(state, ntpData, 'system_peer_mode', value);
        } else if (key === 'reference time') {
            // value looks like:
            //
            // 'dd8c01ff.63b18427  Sat, Oct 14 2017  3:24:47.389'
            value = translateTime(value.split(' ')[0]);
            return addProperty(state, ntpData, 'reftime', value);
        }

        // Everything else should be in NTP_IGNORE_PROPERTIES, or we should add
        // it somewhere so we know it's handled properly.
        mod_assert(NTP_IGNORE_PROPERTIES.indexOf(key) !== -1,
            'Unknown property: ' + matches[1] + '=' + matches[2]);

        return;
    }

    // 'calibration interval' is special in that it doesn't have a ':'
    matches = line.match(/^calibration interval\s+([0-9]+)\s*$/);
    if (matches) {
        return addProperty(state, ntpData, 'calibration_interval',
            Number(matches[1]));
    }

    /* BEGIN JSSTYLED */
    matches = line.match(/([a-z\_]+=[\-a-f0-9\.]+)/g);
    /* END JSSTYLED */
    if (matches) {
        for (idx = 0; idx < matches.length; idx++) {
            chunks = matches[idx].split('=');
            key = chunks[0];
            value = chunks[1];
            if (['remote', 'refid', 'dstadr', 'srcadr', 'dstport', 'srcport']
                .indexOf(key) !== -1) {
                // We don't care about these and they're IP addresses, or ports
                // not metric-worthy Numbers.
                continue;
            }

            if (NTP_NUMBER_PROPERTIES[key] !== undefined) {
                key = NTP_NUMBER_PROPERTIES[key];
            }

            if (['reftime', 'rec'].indexOf(key) !== -1) {
                value = translateTime(value);
            } else {
                value = Number(value);
            }

            addProperty(state, ntpData, key, value);
        }
    } else if (line.indexOf('filt') === 0) {
        /* eslint-disable */
        /* BEGIN JSSTYLED */
        // Some lines like:
        //
        // filtdelay=    45.16   44.90   44.35   45.42   44.26   44.89   45.23   44.30,
        // filtoffset=    7.21    4.51    0.18   -2.80   -1.73    2.06    1.56    1.26,
        // filtdisp=      0.00   15.47   31.02   46.50   62.42   77.82   93.68  109.73
        //
        // we expect, though we don't parse so we don't warn about those and
        // just do nothing.
        /* END JSSTYLED */
        /* eslint-enable */
    } else {
        mod_assert.equal(line, '', 'unexpected output line from ntpq');
    }
}

NtpGetter.prototype.get = function get(callback) {
    mod_assert.func(callback, 'callback');

    var self = this;
    var connRefused = '/usr/sbin/ntpq: read: Connection refused\n';
    var ntpData = {
        ntpd_available: 1
    };

    mod_vasync.pipeline({
        funcs: [
            function getNtpPeers(_, cb) {
                self.ntpqCli(['-n', '-c', 'apeers'],
                    function peersCb(err, stdout, stderr) {
                        var addErr;
                        var addErrs = [];
                        var idx;
                        var lines;

                        if (err) {
                            cb(err);
                            return;
                        }

                        // When ntpd is down, ntpq still returns success, but
                        // has an error on stderr. We catch that here so we can
                        // just return that ntpd_available is false.
                        if (stderr === connRefused) {
                            ntpData.ntpd_available = 0;
                            cb();
                            return;
                        }

                        if (stderr.length > 0) {
                            cb(new Error('Unexpected stderr: ' + stderr));
                            return;
                        }

                        // split lines after removing trailing whitespace
                        lines = stdout.replace(/\s+$/, '').split('\n');

                        if (lines[0] !== PEER_HEADER_1) {
                            cb(new Error('Unexpected header line[0]: ' +
                                lines[0]));
                            return;
                        }

                        if (lines[1] !== PEER_HEADER_2) {
                            cb(new Error('Unexpected header line[1]: ' +
                                lines[1]));
                            return;
                        }

                        /*
                         * Past the header, we expect every line to contain data
                         * about a peer.
                         */

                        for (idx = 2; idx < lines.length; idx++) {
                            addErr = addPeer(ntpData, lines[idx]);
                            if (addErr !== undefined) {
                                addErrs.push(addErr);
                            }
                        }

                        if (addErrs.length > 0) {
                            cb(mod_verror.errorFromList(addErrs));
                            return;
                        }

                        cb();
                    });
            }, function addExtendedData(_, cb) {
                var args = [
                    '-n',
                    '-c', 'iostats',
                    '-c', 'kerninfo',
                    '-c', 'monstats',
                    '-c', 'sysinfo',
                    '-c', 'sysstats'
                ];
                var syspeerAssid;

                // If the peers lookup decided ntpd is unavailable, don't bother
                if (ntpData.ntpd_available === 0) {
                    cb();
                    return;
                }

                if (ntpData.syspeer !== undefined) {
                    syspeerAssid = ntpData.syspeer.assid;
                    args.push('-c', 'readvar ' + syspeerAssid);
                }

                self.ntpqCli(args, function peersCb(err, stdout, stderr) {
                    var addErr;
                    var addErrs = [];
                    var idx;
                    var lines = [];
                    var state = {};

                    if (err) {
                        cb(err);
                        return;
                    }

                    // When ntpd is down, ntpq still returns success, but has
                    // an error on stderr. We catch that here so we can just
                    // return that ntpd_available is false. Note that here we
                    // may have already added the peer data, which is fine for
                    // the metrics to use, just will not be a complete set of
                    // data.
                    if (stderr === connRefused) {
                        ntpData.ntpd_available = 0;
                        cb();
                        return;
                    }

                    // split lines after removing trailing whitespace
                    lines = stdout.replace(/\s+$/, '').split('\n');

                    // Start in local (ntp client) context
                    state.assidContext = 0;

                    for (idx = 0; idx < lines.length; idx++) {
                        if (lines[idx].length > 0) {
                            addErr = addStatLine(state, ntpData, lines[idx]);
                            if (addErr !== undefined) {
                                addErrs.push(addErr);
                            }
                        }
                    }

                    if (addErrs.length > 0) {
                        cb(mod_verror.errorFromList(addErrs));
                        return;
                    }

                    cb();
                });
            }
        ]
    }, function pipelineCb(err) {
        if (err) {
            callback(err);
            return;
        }

        if (!ntpData.peers || ntpData.peers.length < 1) {
            callback(new Error('Unable to find NTP peers.'));
            return;
        }

        if (!ntpData.system ||
            !ntpData.system.hasOwnProperty('processed_for_time')) {

            // 'processed for time' is the last metric we should have read from
            // the extras data, so if we don't have that, consider it an error.
            callback(new Error('Failed to get all NTP data'));
            return;
        }

        callback(null, ntpData);
    });
};

function getNtpData(callback) {
    mod_assert.func(callback, 'callback');

    var ntpGetter = new NtpGetter({});

    return ntpGetter.get(callback);
}

module.exports = {
    getNtpData: getNtpData,
    NtpGetter: NtpGetter, // exposed for testing
    peerStateToNumber: peerStateToNumber
};

if (require.main === module) {
    getNtpData(function _onData(err, ntpData) {
        if (err) {
            console.error('ERROR: ' + err.message);
            return;
        }

        console.log(JSON.stringify(ntpData, null, 2));
    });
}
