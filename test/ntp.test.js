/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/* Test the backend for the ntp collector */

'use strict';

var test = require('tape').test;

var mod_verror = require('verror');

var lib_ntp = require('../lib/instrumenter/lib/ntp');

function missingNtpq(args, callback) {
    /*
     * Simulate ENOENT on ntpq. This was chosen as a representative of a problem
     * executing ntpq. The result when there are other problems executing should
     * be similar just with slightly different codes/messages.
     */
    var err;
    var verr;

    // first build an Error object similar to the one we'd get from cp.spawn
    err = new Error('exec \"/usr/sbin/ntpq\": spawn /usr/sbin/ntpq ENOENT');
    err.code = 'ENOENT';
    err.errno = 'ENOENT';
    err.syscall = 'spawn /usr/sbin/ntpq';
    err.path = '/usr/sbin/ntpq';
    err.spawnargs = args;
    err.cmd = '/usr/sbin/ntpq';

    // now wrap that error with verror, like forkexec would
    verr = mod_verror(err, 'exec "/usr/sbin/ntpq"');

    callback(verr, '', '');
}

function garbageNtpq(_, callback) {
     // Simulate ntpq for some reason returning garbage rather than our metrics.
     callback(null, 'look at me, I am garbage ntp', '');
}

test('test missing ntpq', function _test(t) {
    var getter = new lib_ntp.NtpGetter({
        ntpqCli: missingNtpq
    });

    getter.get(function onGet(err) {
        t.ok(err, 'should have an error');
        if (err) {
            t.equal(err.jse_cause.errno, 'ENOENT', 'should have seen ENOENT');
        }
        t.end();
    });
});

test('test garbage ntpq', function _test(t) {
    var getter = new lib_ntp.NtpGetter({
        ntpqCli: garbageNtpq
    });

    getter.get(function onGet(err) {
        t.ok(err, 'should get an error when ntpq returns garbage');
        t.equal(err.message.split(':')[0], 'Unexpected header line[0]',
            'should have failed due to unexpected header');
        t.end();
    });
});

test('test ntp output parser', function _test(t) {
    /* eslint-disable */
    /* BEGIN JSSTYLED */
    var aPeerData = [
        '     remote       refid   assid  st t when poll reach   delay   offset  jitter',
        '==============================================================================',
        ' 0.smartos.pool. .POOL.   33554  16 p    -   16    0    0.000    0.000   0.000',
        '-45.127.113.2    c1bee641 33555   2 u  764 1024  377  143.432    0.884   5.595',
        '+198.206.133.14  73156f42 33556   3 u  686 1024  377   55.024   -1.116   2.947',
        '-66.241.101.63   a9fe0002 33558   2 u  919 1024  377   32.169    5.590   5.547',
        '-45.127.112.2    c1bee641 33559   2 u  111 1024  377  144.502    1.340   6.290',
        '*198.58.110.84   d8dafeca 33560   2 u  673 1024  377   44.348    0.176   2.328',
        '-96.226.123.196  808a8dac 33562   2 u  815 1024  377   41.150    7.272   8.577',
        '-199.223.248.101 d133a1ee 33566   2 u  279 1024  377   65.716    6.068   6.341',
        '+216.229.0.49    808a8dac 33567   2 u 1046 1024  377   53.543   -6.985   2.267'
    ].join('\n');
    var extraData = [
        'time since reset:       2767601',
        'receive buffers:        10',
        'free receive buffers:   9',
        'used receive buffers:   0',
        'low water refills:      1',
        'dropped packets:        0',
        'ignored packets:        0',
        'received packets:       14767',
        'packets sent:           37664',
        'packet send failures:   0',
        'input wakeups:          42503',
        'useful input wakeups:   42499',
        'associd=0 status=0628 leap_none, sync_ntp, 2 events, no_sys_peer,',
        'pll offset:            0',
        'pll frequency:         0.782669',
        'maximum error:         299.354',
        'estimated error:       2.849',
        'kernel status:         pll',
        'pll time constant:     6',
        'precision:             0.001',
        'frequency tolerance:   512',
        'pps frequency:         0',
        'pps stability:         512',
        'pps jitter:            0.200',
        'calibration interval   4',
        'calibration cycles:    0',
        'jitter exceeded:       0',
        'stability exceeded:    0',
        'calibration errors:    0',
        'enabled:              0x1',
        'addresses:            14',
        'peak addresses:       14',
        'maximum addresses:    13797',
        'reclaim above count:  600',
        'reclaim older than:   64',
        'kilobytes:            1',
        'maximum kilobytes:    1024',
        'associd=0 status=0628 leap_none, sync_ntp, 2 events, no_sys_peer,',
        'system peer:        216.229.0.49:123',
        'system peer mode:   client',
        'leap indicator:     00',
        'stratum:            3',
        'log2 precision:     -22',
        'root delay:         67.416',
        'root dispersion:    46.952',
        'reference ID:       216.229.0.49',
        'reference time:     dd9e1c1e.67c8d279  Fri, Oct 27 2017 20:57:02.405',
        'system jitter:      3.818756',
        'clock jitter:       2.850',
        'clock wander:       0.004',
        'broadcast delay:    -50.000',
        'symm. auth. delay:  0.000',
        'uptime:                 2767601',
        'sysstats reset:         2767601',
        'packets received:       14771',
        'current version:        14228',
        'older version:          0',
        'bad length or format:   0',
        'authentication failed:  0',
        'declined:               0',
        'restricted:             11',
        'rate limited:           0',
        'KoD responses:          0',
        'processed for time:     14214',
        'associd=33560 status=141a reach, sel_candidate, 1 event, sys_peer,',
        'srcadr=198.58.110.84, srcport=123, dstadr=172.26.6.5, dstport=123,',
        'leap=00, stratum=2, precision=-23, rootdelay=37.323, rootdisp=18.600,',
        'refid=216.218.254.202,',
        'reftime=dd9e1d25.73e5ec1d  Fri, Oct 27 2017 21:01:25.452,',
        'rec=dd9e1d7b.65ab93c9  Fri, Oct 27 2017 21:02:51.397, reach=377,',
        'unreach=0, hmode=3, pmode=4, hpoll=10, ppoll=10, headway=0, flash=00 ok,',
        'keyid=0, offset=4.510, delay=44.902, dispersion=18.844, jitter=4.532,',
        'xleave=0.044,',
        'filtdelay=    45.16   44.90   44.35   45.42   44.26   44.89   45.23   44.30,',
        'filtoffset=    7.21    4.51    0.18   -2.80   -1.73    2.06    1.56    1.26,',
        'filtdisp=      0.00   15.47   31.02   46.50   62.42   77.82   93.68  109.73'
    ].join('\n');
    var expectedObj = {
        "ntpd_available": 1,
        "peers": {
          "33554": {
            "state": "invalid",
            "remote": "0.smartos.pool.",
            "refid": ".POOL.",
            "assid": 33554,
            "st": 16,
            "t": "p",
            "when": -1,
            "poll": 16,
            "reach": 0,
            "delay": 0,
            "offset": 0,
            "jitter": 0
          },
          "33555": {
            "state": "pruned",
            "remote": "45.127.113.2",
            "refid": "c1bee641",
            "assid": 33555,
            "st": 2,
            "t": "u",
            "when": 764,
            "poll": 1024,
            "reach": 255,
            "delay": 143.432,
            "offset": 0.884,
            "jitter": 5.595
          },
          "33556": {
            "state": "candidate",
            "remote": "198.206.133.14",
            "refid": "73156f42",
            "assid": 33556,
            "st": 3,
            "t": "u",
            "when": 686,
            "poll": 1024,
            "reach": 255,
            "delay": 55.024,
            "offset": -1.116,
            "jitter": 2.947
          },
          "33558": {
            "state": "pruned",
            "remote": "66.241.101.63",
            "refid": "a9fe0002",
            "assid": 33558,
            "st": 2,
            "t": "u",
            "when": 919,
            "poll": 1024,
            "reach": 255,
            "delay": 32.169,
            "offset": 5.59,
            "jitter": 5.547
          },
          "33559": {
            "state": "pruned",
            "remote": "45.127.112.2",
            "refid": "c1bee641",
            "assid": 33559,
            "st": 2,
            "t": "u",
            "when": 111,
            "poll": 1024,
            "reach": 255,
            "delay": 144.502,
            "offset": 1.34,
            "jitter": 6.29
          },
          "33560": {
            "state": "syspeer",
            "remote": "198.58.110.84",
            "refid": "d8dafeca",
            "assid": 33560,
            "st": 2,
            "t": "u",
            "when": 673,
            "poll": 1024,
            "reach": 255,
            "delay": 44.348,
            "offset": 0.176,
            "jitter": 2.328
          },
          "33562": {
            "state": "pruned",
            "remote": "96.226.123.196",
            "refid": "808a8dac",
            "assid": 33562,
            "st": 2,
            "t": "u",
            "when": 815,
            "poll": 1024,
            "reach": 255,
            "delay": 41.15,
            "offset": 7.272,
            "jitter": 8.577
          },
          "33566": {
            "state": "pruned",
            "remote": "199.223.248.101",
            "refid": "d133a1ee",
            "assid": 33566,
            "st": 2,
            "t": "u",
            "when": 279,
            "poll": 1024,
            "reach": 255,
            "delay": 65.716,
            "offset": 6.068,
            "jitter": 6.341
          },
          "33567": {
            "state": "candidate",
            "remote": "216.229.0.49",
            "refid": "808a8dac",
            "assid": 33567,
            "st": 2,
            "t": "u",
            "when": 1046,
            "poll": 1024,
            "reach": 255,
            "delay": 53.543,
            "offset": -6.985,
            "jitter": 2.267
          }
        },
        "syspeer": {
          "assid": 33560,
          "remote": "198.58.110.84",
          "leap_indicator": 0,
          "stratum": 2,
          "precision": -23,
          "root_delay": 37.323,
          "root_dispersion": 18.6,
          "reftime": 3718126885.1944447,
          "rec": 3718126971.170574,
          "reach": 377,
          "unreach": 0,
          "hmode": 3,
          "pmode": 4,
          "hpoll": 10,
          "ppoll": 10,
          "headway": 0,
          "flash": 0,
          "keyid": 0,
          "offset": 4.51,
          "delay": 44.902,
          "dispersion": 18.844,
          "jitter": 4.532,
          "xleave": 0.044
        },
        "system": {
          "time_since_reset": 2767601,
          "receive_buffers": 10,
          "free_receive_buffers": 9,
          "used_receive_buffers": 0,
          "low_water_refills": 1,
          "dropped_packets": 0,
          "ignored_packets": 0,
          "received_packets": 14767,
          "packets_sent": 37664,
          "packet_send_failures": 0,
          "input_wakeups": 42503,
          "useful_input_wakeups": 42499,
          "pll_offset": 0,
          "pll_frequency": 0.782669,
          "maximum_error": 299.354,
          "estimated_error": 2.849,
          "kernel_status": "pll",
          "pll_time_constant": 6,
          "precision": 0.001,
          "frequency_tolerance": 512,
          "pps_frequency": 0,
          "pps_stability": 512,
          "pps_jitter": 0.2,
          "calibration_interval": 4,
          "calibration_cycles": 0,
          "jitter_exceeded": 0,
          "stability_exceeded": 0,
          "calibration_errors": 0,
          "enabled": 1,
          "addresses": 14,
          "peak_addresses": 14,
          "maximum_addresses": 13797,
          "reclaim_above_count": 600,
          "reclaim_older_than": 64,
          "kilobytes": 1,
          "maximum_kilobytes": 1024,
          "system_peer_mode": "client",
          "leap_indicator": 0,
          "stratum": 3,
          "log2_precision": -22,
          "root_delay": 67.416,
          "root_dispersion": 46.952,
          "reftime": 3718126622.1741214,
          "system_jitter": 3.818756,
          "clock_jitter": 2.85,
          "clock_wander": 0.004,
          "broadcast_delay": -50,
          "symmetric_auth_delay": 0,
          "uptime": 2767601,
          "sysstats_reset": 2767601,
          "packets_received": 14771,
          "current_version": 14228,
          "older_version": 0,
          "bad_length_or_format": 0,
          "authentication_failed": 0,
          "declined": 0,
          "restricted": 11,
          "rate_limited": 0,
          "kod_responses": 0,
          "processed_for_time": 14214
        }
    };
    /* END JSSTYLED */
    /* eslint-enable */
    var getter = new lib_ntp.NtpGetter({
        ntpqCli: function fakeNtpCli(args, callback) {
            if (JSON.stringify(args) === '["-n","-c","apeers"]') {
                callback(null, aPeerData, '');
            } else if (JSON.stringify(args) ===
                '["-n","-c","iostats","-c","kerninfo","-c","monstats","-c",' +
                '"sysinfo","-c","sysstats","-c","readvar 33560"]') {

                callback(null, extraData, '');
            } else {
                // should not be called
                t.ok(false, 'Unexpected ntpq args: ' + JSON.stringify(args));
                callback(null, '', '');
            }
        }
    });

    getter.get(function onGet(err, data) {
        t.ifError(err, 'should succeed to get metrics');
        t.deepEqual(data, expectedObj, 'parsed data should match expectation');
        t.end();
    });
});
