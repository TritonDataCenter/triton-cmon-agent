/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/* eslint-disable */
/* BEGIN JSSTYLED */
//
// Note:
//
// When navigating the ntp source looking for these parameters, you can take the
// raw parameter name and search for those first, then follow this pattern:
//
// ntp-4.2.8p8 joshw$ grep -rH "system peer mode" *
// ntpdc/ntpdc_ops.c:   (void) fprintf(fp, "system peer mode:     %s\n", modetoa(is->peer_mode));
// ntpq/ntpq-subs.c:    VDC_INIT("peermode",        "system peer mode: ", NTP_MODE),
//
// which tells you the variable is 'peermode', from there:
//
// ntp-4.2.8p8 joshw$ grep -rH "peermode" *
// ntpd/ntp_control.c: { CS_PEERMODE,      RO, "peermode" },   /* 45 */
// ntpq/ntpq-subs.c:   VDC_INIT("peermode",        "system peer mode: ", NTP_MODE),
//
// which tells you you can look for CS_PEERMODE in ntpd/ntp_control.c, where
// you'll find code like:
//
//     case CS_PEERMODE:
//         u = (sys_peer != NULL)
//             ? sys_peer->hmode
//             : MODE_UNSPEC;
//         ctl_putuint(sys_var[CS_PEERMODE].text, u);
//         break;
//
// which gives you the next hints where to find the value.
//
/* END JSSTYLED */
/* eslint-enable */

'use strict';
var mod_assert = require('assert-plus');
var mod_verror = require('verror');

var lib_common = require('../../common');
var lib_ntp = require('../lib/ntp');


/*
 * Typically our ntp polling frequency is 1024s, so polling ntpq more frequently
 * than that is unlikely to result in different results. But the various
 * candidate servers are offset from each other, so we currently choose 64 as it
 * allows us 16 ntpq calls per ntp polling period.
 */
var NTP_METRIC_TTL = 64;

// We use this as an "enum" so return the index of the mode we found.
var NTP_MODES = [
    'bclient',     // 0
    'broadcast',   // 1
    'client',      // 2
    'control',     // 3
    'private',     // 4
    'server',      // 5
    'sym_active',  // 6
    'sym_passive', // 7
    'unspec'       // 8
];
var NTP_PEER_TYPES = [
    'u', // unicast
    'b', // broadcast
    'l', // local reference clock
    's', // symmetric peer
    'A', // anycast server
    'B', // broadcast server
    'M'  // multicast server
];
/* eslint-disable */
/* BEGIN JSSTYLED */
var NTP_REFID_TYPES = [
    '.IPADDR.', // A remote peer or server.
    '.ACST.',   // NTP manycast server.
    '.ACTS.',   // Automated Computer Time Service clock reference from the American National Institute of Standards and Technology.
    '.AUTH.',   // Authentication error.
    '.AUTO.',   // Autokey sequence error.
    '.BCST.',   // NTP broadcast server.
    '.CHU.',    // Shortwave radio receiver from station CHU operating out of Ottawa, Ontario, Canada.
    '.CRYPT.',  // Autokey protocol error
    '.DCFx.',   // LF radio receiver from station DCF77 operating out of Mainflingen, Germany.
    '.DENY.',   // Access denied by server.
    '.GAL.',    // European Galileo satellite receiver.
    '.GOES.',   // American Geostationary Operational Environmental Satellite receiver.
    '.GPS.',    // American Global Positioning System receiver.
    '.HBG.',    // LF radio receiver from station HBG operating out of Prangins, Switzerland.
    '.INIT.',   // Peer association initialized.
    '.IRIG.',   // Inter Range Instrumentation Group time code.
    '.JJY.',    // LF radio receiver from station JJY operating out of Mount Otakadoya, near Fukushima, and also on Mount Hagane, located on Kyushu Island, Japan.
    '.LFx.',    // Generic LF radio receiver.
    '.LOCL.',   // The local clock on the host.
    '.LORC.',   // LF radio receiver from Long Range Navigation (LORAN-C) radio beacons.
    '.MCST.',   // NTP multicast server.
    '.MSF.',    // National clock reference from Anthorn Radio Station near Anthorn, Cumbria.
    '.NIST.',   // American National Institute of Standards and Technology clock reference.
    '.PPS.',    // Pulse per second clock discipline.
    '.PTB.',    // Physikalisch-Technische Bundesanstalt clock reference operating out of Brunswick and Berlin, Germany.
    '.RATE.',   // NTP polling rate exceeded.
    '.STEP.',   // NTP step time change. The offset is less than 1000 millisecends but more than 125 milliseconds.
    '.TDF.',    // LF radio receiver from station TéléDiffusion de France operating out of Allouis, France.
    '.TIME.',   // NTP association timeout.
    '.USNO.',   // United States Naval Observatory clock reference.
    '.WWV.',    // HF radio receiver from station WWV operating out of Fort Collins, Colorado, United States.
    '.WWVB.',   // LF radio receiver from station WWVB operating out of Fort Collins, Colorado, United States.
    '.WWVH.'    // HF radio receiver from station WWVH operating out of Kekaha, on the island of Kauai in the state of Hawaii, United States.
];
/* END JSSTYLED */
/* eslint-enable */

/*
 * Metric definitions.
 */

var NTP_PEER_METRICS = {
    // we ignore assid here since that doesn't seem important for now
    delay: {
        enabled: true,
        help: 'Total roundtrip delay between the local ntpd and the peer',
        key: 'ntp_peer_delay_seconds',
        modifier: lib_common.msecToSec,
        type: 'gauge'
    },
    jitter: {
        enabled: true,
        help: 'The RMS differences relative to the lowest delay sample',
        key: 'ntp_peer_jitter_ppm',
        type: 'gauge'
    },
    offset: {
        enabled: true,
        help: 'how far off local clock is from the peer\'s reported time',
        key: 'ntp_peer_offset_seconds',
        modifier: lib_common.msecToSec,
        type: 'gauge'
    },
    poll: {
        enabled: true,
        help: 'How often the peer is queried for the time',
        key: 'ntp_peer_poll_interval_seconds',
        type: 'gauge'
    },
    reach: {
        // This value comes to us as a single byte represented in octal, which
        // we then convert to decimal. As a either an octal or decimal value,
        // it's not clear how useful this is since a single failure will result
        // in a set of values like:
        //
        // 255, 254, 253, 251, 247, 239, 223, 191, 127, 255
        //
        // that indicates everything was fine, then one poll failed, then
        // everything was fine again after that. But graphing these numbers I
        // think it'll be hard to see that from 253 onward is all success.
        //
        // The pattern above is:
        //
        //   | binary   | dec | description                                 |
        //   +----------+-----+---------------------------------------------+
        //   | 11111111 | 255 | no failures                                 |
        //   | 11111110 | 254 | most recent poll failed                     |
        //   | 11111101 | 253 | most recent poll succeeded, previous failed |
        //   | 11111011 | 251 | all succeeded, except 2 polls ago           |
        //   | 11110111 | 247 | all succeeded, except 3 polls ago           |
        //   | 11101111 | 239 | all succeeded, except 4 polls ago           |
        //   | 11011111 | 223 | all succeeded, except 5 polls ago           |
        //   | 10111111 | 191 | all succeeded, except 6 polls ago           |
        //   | 01111111 | 127 | all succeeded, except 7 polls ago           |
        //   | 11111111 | 255 | no failures                                 |
        //
        // So instead of just exposing the numbers, we expose a count of the
        // number of 0 bits in the byte. This way zero means that there have
        // been no failures in the last 8 polls, and 1-8 mean there have been
        // that many failures in the last 8 polls. On a graph for monitoring
        // this looks much nicer in the case above, as the pattern in this same
        // case would look like:
        //
        //  0, 1, 1, 1, 1, 1, 1, 1, 1, 0
        //
        // indicating everything was fine, then we had a single error, then 8
        // polling periods later we had no failures in the past 8.
        enabled: true,
        help: 'Number of failed polls in the last 8 attempts to poll this peer',
        key: 'ntp_peer_last8_polls_failure_count',
        modifier: function peerReachToFailureCount(value) {
            var bits = value.toString(2);

            // 'bits' might not have enough bits, make sure we have 8
            bits = '00000000'.substr(0, 8 - bits.length) + bits;

            mod_assert.equal(bits.length, 8, 'should be 8 bits in a byte');

            // returns count of 0 bits
            return (bits.replace(/1/g, '').length);
        },
        type: 'gauge'
    },
    refid: {
        enabled: true,
        help: 'Where the peer is getting its time',
        key: 'ntp_peer_refid_number',
        modifier: peerRefidToNumber,
        type: 'gauge'
    },
    t: {
        enabled: true,
        help: 'The type of connection',
        key: 'ntp_peer_connection_type',
        modifier: function peerTypeToNumber(value) {
            // will be -1 for unknown types
            return (NTP_PEER_TYPES.indexOf(value));
        },
        type: 'gauge'
    },
    st: {
        enabled: true,
        help: 'The stratum of the peer',
        key: 'ntp_peer_stratum_number',
        type: 'gauge'
    },
    // possible states (from lib/instrumenter/lib/ntp.js):
    //
    // unknown state   // -1
    // 'invalid',      // 0
    // 'falseticker',  // 1
    // 'overflow',     // 2
    // 'pruned',       // 3
    // 'candidate',    // 4
    // 'backup',       // 5
    // 'syspeer',      // 6
    // 'pps'           // 7
    state: {
        enabled: true,
        help: 'The state of the peer',
        key: 'ntp_peer_state',
        modifier: lib_ntp.peerStateToNumber,
        type: 'gauge'
    },
    when: {
        enabled: true,
        help: 'The last time when the server was queried for the time',
        key: 'ntp_peer_last_query_seconds',
        type: 'gauge'
    }
};
var NTP_SYSPEER_METRICS = {
    delay: {
        enabled: true,
        help: 'Total roundtrip delay between the local ntpd and the ' +
            'system peer',
        key: 'ntp_syspeer_delay_seconds',
        modifier: lib_common.msecToSec,
        type: 'gauge'
    },
    dispersion: {
        // From RFC 5905: The dispersion (epsilon) represents the maximum error
        // inherent in the measurement.
        enabled: true,
        help: 'Total dispersion between the local ntpd and the ' +
            'system peer',
        key: 'ntp_syspeer_dispersion_seconds',
        modifier: lib_common.msecToSec,
        type: 'gauge'
    },
    headway: {
        enabled: true,
        help: 'The interval between the last packet sent or received and the ' +
            'next packet',
        key: 'ntp_syspeer_headway_seconds',
        modifier: lib_common.usecToSec,
        type: 'gauge'
    },
    // Modes from RFC 5905 (values for hmode):
    //
    // #define M_RSVD 0 /* reserved */
    // #define M_SACT 1 /* symmetric active */
    // #define M_PASV 2 /* symmetric passive */
    // #define M_CLNT 3 /* client */
    // #define M_SERV 4 /* server */
    // #define M_BCST 5 /* broadcast server */
    // #define M_BCLN 6 /* broadcast client */
    hmode: {
        enabled: true,
        help: 'Host mode number',
        key: 'ntp_syspeer_hmode_number',
        type: 'gauge'
    },
    hpoll: {
        enabled: true,
        help: 'The host poll interval in log2 seconds',
        key: 'ntp_syspeer_hpoll_interval_log2s',
        type: 'gauge'
    },
    jitter: {
        enabled: true,
        help: 'The RMS differences relative to the lowest delay sample',
        key: 'ntp_syspeer_jitter_ppm',
        type: 'gauge'
    },
    keyid: {
        // Disabled currently because we don't use keys and can't imagine this
        // being useful for monitoring.
        enabled: false,
        help: 'The key ID of the system peer',
        key: 'ntp_syspeer_key_id_number',
        type: 'gauge'
    },
    leap_indicator: {
        enabled: true,
        help: 'Indicates whether or not there is a leap second upcoming on ' +
            'the system peer',
        key: 'ntp_syspeer_leap_indicator_status',
        type: 'gauge'
    },
    offset: {
        enabled: true,
        help: 'The combined offset of server relative to this host',
        key: 'ntp_syspeer_offset_seconds',
        modifier: lib_common.usecToSec,
        type: 'gauge'
    },
    // Modes from include/ntp.h in ntp-4.2.8p8 (values for pmode)
    // #define MODE_UNSPEC     0       /* unspecified (old version) */
    // #define MODE_ACTIVE     1       /* symmetric active mode */
    // #define MODE_PASSIVE    2       /* symmetric passive mode */
    // #define MODE_CLIENT     3       /* client mode */
    // #define MODE_SERVER     4       /* server mode */
    // #define MODE_BROADCAST  5       /* broadcast mode */
    pmode: {
        enabled: true,
        help: 'Peer mode number',
        key: 'ntp_syspeer_pmode_number',
        type: 'gauge'
    },
    ppoll: {
        enabled: true,
        help: 'The peer poll interval in log2 seconds',
        key: 'ntp_syspeer_ppoll_interval_log2s',
        type: 'gauge'
    },
    precision: {
        enabled: true,
        help: 'The system peer\'s clock precision in log2 seconds',
        key: 'ntp_syspeer_precision_log2s',
        type: 'gauge'
    },
    rec: {
        enabled: true,
        help: 'Time when we last receieved an update from system peer',
        key: 'ntp_syspeer_rec_seconds',
        type: 'gauge'
    },
    reftime: {
        enabled: true,
        help: 'Time when the system peer\'s clock was last set or corrected',
        key: 'ntp_syspeer_reftime_seconds',
        type: 'gauge'
    },
    root_delay: {
        enabled: true,
        help: 'Total roundtrip delay to the primary reference clock from the ' +
            'system peer',
        key: 'ntp_syspeer_root_delay_seconds',
        modifier: lib_common.msecToSec,
        type: 'gauge'
    },
    root_dispersion: {
        // From RFC 5905: The dispersion (epsilon) represents the maximum error
        // inherent in the measurement.
        enabled: true,
        help: 'Total dispersion to the primary reference clock from the ' +
            'system peer',
        key: 'ntp_syspeer_root_dispersion_seconds',
        modifier: lib_common.msecToSec,
        type: 'gauge'
    },
    stratum: {
        enabled: true,
        help: 'The stratum of the system peer that local ntpd is syncing with',
        key: 'ntp_syspeer_stratum_number',
        type: 'gauge'
    },
    unreach: {
        enabled: true,
        help: 'Number of times the system peer was unreachable',
        key: 'ntp_syspeer_unreach_total',
        type: 'counter'
    },
    xleave: {
        enabled: true,
        help: 'Represents the internal queuing, buffering and transmission ' +
            'delays in interleaved mode',
        key: 'ntp_syspeer_xleave_seconds',
        modifier: lib_common.usecToSec,
        type: 'gauge'
    }
};
var NTP_SYSTEM_METRICS = {

    /*
     * from ntpq's iostats
     */

    dropped_packets: {
        enabled: true,
        help: 'Number of packets dropped on reception',
        key: 'ntp_dropped_packets_total',
        type: 'counter'
    },
    free_receive_buffers: {
        enabled: true,
        help: 'Number of recvbuffs that are on the free list',
        key: 'ntp_free_receive_buffers_count',
        type: 'gauge'
    },
    ignored_packets: {
        enabled: true,
        help: 'Number packets received on wild card interface',
        key: 'ntp_ignored_packets_total',
        type: 'counter'
    },
    input_wakeups: {
        enabled: true,
        help: 'Number of times interrupt handler was called for input.',
        key: 'ntp_input_wakeups_total',
        type: 'counter'
    },
    low_water_refills: {
        enabled: true,
        help: 'Number of times ntpd has added memory',
        key: 'ntp_low_water_refill_count',
        type: 'counter'
    },
    packet_send_failures: {
        enabled: true,
        help: 'Number of packets that could not be sent',
        key: 'ntp_packet_send_failures_total',
        type: 'counter'
    },
    packets_sent: {
        enabled: true,
        help: 'Number of packets sent',
        key: 'ntp_packet_sent_total',
        type: 'counter'
    },
    receive_buffers: {
        enabled: true,
        help: 'Total number of recvbuffs currently in use',
        key: 'ntp_receive_buffers_count',
        type: 'gauge'
    },
    received_packets: {
        enabled: true,
        help: 'Number of packets received',
        key: 'ntp_packet_received_total',
        type: 'counter'
    },
    time_since_reset: {
        enabled: true,
        help: 'Number of seconds since the NTP iostats were last reset',
        key: 'ntp_time_since_reset_seconds',
        type: 'counter'
    },
    used_receive_buffers: {
        enabled: true,
        key: 'ntp_used_receive_buffers_count',
        type: 'gauge',
        help: 'Number of recvbuffs that are full'
    },
    useful_input_wakeups: {
        enabled: true,
        key: 'ntp_useful_input_wakeups_total',
        type: 'counter',
        help: 'Number of packets received by handler'
    },

    /*
     * from ntpq's kerninfo
     */

    calibration_cycles: {
        // See pps_calcnt in uts/common/os/clock.c
        enabled: true,
        help: 'counts the frequency calibration intervals which are variable ' +
            'from 4s to 256s',
        key: 'ntp_calibration_cycles_total',
        type: 'counter'
    },
    calibration_interval: {
        // See pps_shift in uts/common/os/clock.c
        enabled: true,
        help: 'The duration of the calibration interval (in seconds)',
        key: 'ntp_calibration_interval_seconds',
        type: 'gauge'
    },
    estimated_error: {
        // See time_esterror in uts/common/os/clock.c
        // The raw value is in microseconds.
        enabled: true,
        help: 'The estimated error in the clock (in seconds)',
        key: 'ntp_estimated_error_seconds',
        modifier: lib_common.usecToSec,
        type: 'gauge'
    },
    frequency_tolerance: {
        // See time_tolerance in uts/common/os/clock.c
        enabled: true,
        help: 'Determines maximum frequency error or tolerance of the CPU ' +
            'clock oscillator (in ppm)',
        key: 'ntp_frequency_tolerance_ppm',
        type: 'gauge'
    },
    jitter_exceeded: {
        // See pps_jitcnt in uts/common/os/clock.c
        enabled: true,
        help: 'Counts the seconds that have been discarded because the jitter' +
            ' measured by the time median filter exceeds the limit MAXTIME ' +
            '(100 us)',
        key: 'ntp_jitter_exceeded_seconds_total',
        type: 'counter'
    },
    kernel_status: {
        /*
         * This is disabled because ntpq exposes this by taking the raw value
         * and turning it into a set of string-separated flags. This seems
         * unfortunate as we'd like the raw value and don't want to put it all
         * back together, so it's disabled until we come up with a good
         * solution.
         *
         * See: decode_bitflags in ntp-4.2.8p8/libntp/statestr.c for more
         * details.
         */
        enabled: false,
        help: 'Kernel status flags',
        key: 'ntp_kernel_status',
        type: 'gauge'
    },
    maximum_error: {
        // See time_maxerror in uts/common/os/clock.c
        // The raw value is in microseconds.
        enabled: true,
        help: 'The maximum error in the clock as calculated by the kernel ' +
            '(in seconds)',
        key: 'ntp_maximum_error_seconds',
        modifier: lib_common.usecToSec,
        type: 'gauge'
    },
    pll_frequency: {
        // See time_freq in uts/common/os/clock.c
        enabled: true,
        help: 'The frequency offset of the kernel time from the pps signal ' +
            '(scaled ppm)',
        key: 'ntp_frequency_offset_ppm',
        type: 'gauge'
    },
    pll_offset: {
        // See time_offset in uts/common/os/clock.c
        // The raw value is in microseconds.
        enabled: true,
        help: 'This is the current offset from correct time that the kernel ' +
            'uses to compute any adjustment required',
        key: 'ntp_pll_offset_seconds',
        modifier: lib_common.usecToSec,
        type: 'gauge'
    },
    pll_time_constant: {
        // See time_constant in uts/common/os/clock.c
        enabled: true,
        help: 'This determines the bandwidth or "stiffness" of the PLL',
        key: 'ntp_pll_time_const',
        type: 'gauge'
    },
    pps_frequency: {
        // See pps_freq in uts/common/os/clock.c
        enabled: true,
        help: 'The frequency offset produced by the frequency median filter ' +
            'pps_ff[] (scaled ppm)',
        key: 'ntp_pps_frequency_ppm',
        type: 'gauge'
    },
    pps_jitter: {
        // See pps_jitter in uts/common/os/clock.c
        enabled: true,
        help: 'The dispersion (jitter) measured by the time median filter ' +
            'pps_tf[] (scaled ppm)',
        key: 'ntp_pps_jitter_ppm',
        type: 'gauge'
    },
    pps_stability: {
        // See pps_stabil in uts/common/os/clock.c
        enabled: true,
        help: 'The dispersion (wander) measured by frequency median filter ' +
            'pps_ff[] (scaled ppm)',
        key: 'ntp_pps_stability_ppm',
        type: 'gauge'
    },
    precision: {
        // See time_constant in uts/common/os/clock.c
        enabled: true,
        help: 'Clock precision (in seconds)',
        key: 'ntp_precision',
        modifier: lib_common.usecToSec,
        type: 'gauge'
    }, stability_exceeded: {
        // See pps_stbcnt in uts/common/os/clock.c
        enabled: true,
        help: 'Counts the calibration intervals that have been discarded ' +
            'because the frequency wander exceeds the limit ' +
            'MAXFREQ / 4 (25 us)',
        key: 'ntp_stability_exceeded_seconds_total',
        type: 'counter'
    },

    /*
     * from ntpq's monstats
     */

    enabled: {
        // mon_enabled in ntpd
        enabled: true,
        help: 'Indicates whether or not the MRU monitoring facility is enabled',
        key: 'ntp_mru_monitor_enabled_boolean',
        type: 'gauge'
    },
    addresses: {
        // mru_entries in ntpd
        enabled: true,
        help: 'The number of address entries in the MRU monitoring list',
        key: 'ntp_mru_monitor_address_count',
        type: 'gauge'
    },
    peak_addresses: {
        // mru_peakentries in ntpd
        enabled: true,
        help: 'The maximum number of addresses ntpd has had in the MRU ' +
            'monitoring list',
        key: 'ntp_mru_monitor_max_address_count',
        type: 'gauge'
    },
    maximum_addresses: {
        // mru_mru_maxdepth in ntpd
        enabled: true,
        help: 'The hard limit on the number of addresses ntpd can have in ' +
            'the MRU monitoring list',
        key: 'ntp_mru_monitor_max_address_limit',
        type: 'gauge'
    },
    reclaim_above_count: {
        // mru_mindepth in ntpd
        enabled: true,
        help: 'The floor on the count of addresses in the MRU monitoring ' +
            'list beneath which entries are kept without regard to their age',
        key: 'ntp_mru_monitor_min_address_limit',
        type: 'gauge'
    },
    reclaim_older_than: {
        // mru_maxage in ntpd
        enabled: true,
        help: 'The ceiling on the age in seconds of entries. Entries older ' +
            'than this are reclaimed once ntp_mru_monitor_min_address_limit ' +
            'is exceeded',
        key: 'ntp_mru_monitor_max_age_limit',
        type: 'gauge'
    },
    kilobytes: {
        // CS_MRU_MEM in ntpd
        enabled: true,
        help: 'The number of bytes used by all the entries currently on the ' +
            'MRU monitoring list (in bytes)',
        key: 'ntp_mru_monitor_memory_bytes',
        modifier: lib_common.kibibytesToBytes,
        type: 'gauge'
    },
    maximum_kilobytes: {
        // CS_MRU_MAXMEM in ntpd
        enabled: true,
        help: 'The number of bytes used by all the entries on the MRU ' +
            'monitoring list when it was at its maximum size (in bytes)',
        key: 'ntp_mru_monitor_max_memory_bytes',
        modifier: lib_common.kibibytesToBytes,
        type: 'gauge'
    },

    /*
     * from ntpq's sysinfo
     */

    broadcast_delay: {
        // sys_bdelay
        enabled: true,
        help: 'Broadcast client default delay (seconds)',
        key: 'ntp_broadcast_delay_seconds',
        modifier: lib_common.usecToSec,
        type: 'gauge'
    },
    clock_jitter: {
        // clk_jitter
        enabled: true,
        help: 'Clock jitter calculated by the clock discipline module ' +
            '(exponentially-weighted RMS average)',
        key: 'ntp_clock_jitter_ppm',
        type: 'gauge'
    },
    clock_wander: {
        // clk_wander
        enabled: true,
        help: 'Clock frequency wander (ppm)',
        key: 'ntp_clock_frequency_wander_ppm',
        type: 'gauge'
    },
    /*
     * Leap indicator meaning, from RFC 5905:
     *  +-------+---------------------------------------+
     *  | Value | Meaning                               |
     *  +-------+---------------------------------------+
     *  | 0     | no warning                            |
     *  | 1     | last minute of the day has 61 seconds |
     *  | 2     | last minute of the day has 59 seconds |
     *  | 3     | unknown (clock unsynchronized)        |
     *  +-------+---------------------------------------+
     */
    leap_indicator: {
        enabled: true,
        help: 'Indicates whether or not there is a leap second upcoming',
        key: 'ntp_leap_indicator_status',
        type: 'gauge'
    },
    log2_precision: {
        enabled: true,
        help: 'The local clock precision in log2 seconds',
        key: 'ntp_precision_log2s',
        type: 'gauge'
    },
    stratum: {
        enabled: true,
        help: 'The current stratum of the ntpd on this host',
        key: 'ntp_stratum_number',
        type: 'gauge'
    },
    symmetric_auth_delay: {
        // sys_authdelay
        // Disabled currently as we don't use authentication in Triton.
        enabled: false,
        help: 'Authentication delay',
        key: 'ntp_authentication_delay',
        type: 'gauge'
    },
    system_jitter: {
        // sys_jitter
        enabled: true,
        help: 'Combined system jitter (exponentially-weighted RMS average)',
        key: 'ntp_sys_jitter_ppm',
        type: 'gauge'
    },
    system_peer_mode: {
        enabled: true,
        help: 'Indicates the mode of the syspeer',
        key: 'ntp_syspeer_mode_number',
        modifier: function enumMode(mode) {
            // Can be -1 on not found.
            return (NTP_MODES.indexOf(mode));
        },
        type: 'gauge'
    },
    reftime: {
        enabled: true,
        help: ' Time when the system clock was last set or corrected, ' +
            'in NTP timestamp format',
        key: 'ntp_reftime_seconds',
        type: 'gauge'
    },
    root_delay: {
        enabled: true,
        help: 'Total roundtrip delay to the primary reference clock',
        key: 'ntp_root_delay_seconds',
        modifier: lib_common.msecToSec,
        type: 'gauge'
    },
    root_dispersion: {
        // From RFC 5905: The dispersion (epsilon) represents the maximum error
        // inherent in the measurement.
        enabled: true,
        help: 'Total dispersion to the primary reference clock',
        key: 'ntp_root_dispersion_seconds',
        modifier: lib_common.msecToSec,
        type: 'gauge'
    },

    /*
     * from ntpq's sysstats
     */

    authentication_failed: {
        enabled: true,
        help: 'Number of failed authentications',
        key: 'ntp_authentication_failures_total',
        type: 'counter'
    },
    bad_length_or_format: {
        enabled: true,
        help: 'Number of packets received with bad length or malformatted',
        key: 'ntp_bad_length_or_format_total',
        type: 'counter'
    },
    current_version: {
        enabled: true,
        help: 'Number of packets received with the same version as this ntpd',
        key: 'ntp_same_version_total',
        type: 'counter'
    },
    declined: {
        enabled: true,
        help: 'Requests denied because of incorrect group, or because this ' +
            'ntpd is not ready',
        key: 'ntp_declined_total',
        type: 'counter'
    },
    kod_responses: {
        enabled: true,
        help: 'Number of times a "Kiss of Death" packet was sent by ntpd to ' +
            'a client requesting the client to slow down',
        key: 'ntp_kod_responses_total',
        type: 'counter'
    },
    older_version: {
        enabled: true,
        help: 'Number of packets received with an older version than this ntpd',
        key: 'ntp_old_version_total',
        type: 'counter'
    },
    packets_received: {
        /*
         * This is disabled because it will be the same value as the
         * received_packets from iostats, only it will include some of the
         * packets we sent for our requests (such as the iostats request itself)
         * as well. So there's no point showing both.
         */
        enabled: false,
        help: 'Number of packets received',
        key: 'ntp_packets_received_total',
        type: 'counter'
    },
    processed_for_time: {
        enabled: true,
        help: 'Number of packets received that were processed',
        key: 'ntp_packets_processed_total',
        type: 'counter'
    },
    rate_limited: {
        enabled: true,
        help: 'Number of packets that were rate-limited',
        key: 'ntp_packets_rate_limited_total',
        type: 'counter'
    },
    restricted: {
        enabled: true,
        help: 'Number of packets rejected with "access denied"',
        key: 'ntp_access_denied_packets_total',
        type: 'counter'
    },
    sysstats_reset: {
        enabled: true,
        help: 'Time since system stats were last reset (in seconds)',
        key: 'ntp_sysstats_reset_seconds',
        type: 'counter'
    },
    uptime: {
        enabled: true,
        help: 'Seconds since ntpd was initialized',
        key: 'ntp_uptime_seconds',
        type: 'counter'
    }

};

function NtpMetricCollector(opts) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.func(opts.getNtpData, 'opts.getNtpData');
    mod_assert.object(opts.log, 'opts.log');

    self.getNtpData = opts.getNtpData;
    self.log = opts.log;

    // We allow empty results in the case where we get an error from the
    // underlying ntp library. This is so that if ntpd is somehow off or broken
    // we don't prevent the client from getting other GZ metrics.
    self.EMPTY_OK = true;
}

function peerRefidToNumber(value) {

    // IPs come from `ntpq -n -c apeers` and are in hex like `8a27170d`
    if (value.length === 8 && value.match(/^[a-f0-9]+$/)) {
        value = '.IPADDR.';
    }

    // will be -1 if not found
    return (NTP_REFID_TYPES.indexOf(value));
}

function pushMetric(metrics, collection, source, sysMetric, label) {
    var pushObj;
    var value = source[sysMetric];

    if (collection[sysMetric].modifier !== undefined) {
        value = collection[sysMetric].modifier(value);
    }

    pushObj = {
        help: collection[sysMetric].help,
        key: collection[sysMetric].key,
        type: collection[sysMetric].type,
        value: value.toString()
    };

    if (label !== undefined) {
        pushObj.label = label;
    }

    metrics.push(pushObj);
}

NtpMetricCollector.prototype.getMetrics = function getMetrics(opts, callback) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.func(callback, 'callback');

    self.getNtpData(function _onData(err, ntpData) {
        var idx;
        var msg;
        var metrics = [];
        var newErr;
        var peerInfo;
        var peerIdx;
        var peerKeys;
        var peerMetric;
        var peerMetricKeys;
        var sysMetric;
        var sysMetricKeys;
        var sysPeerMetric;
        var sysPeerMetricKeys;

        if (err || (ntpData && !ntpData.ntpd_available)) {
            msg = 'Error getting NTP metrics, ntpd unavailable';
            newErr = new mod_verror({
                cause: (err ? err : undefined),
                name: 'NotAvailableError'
            }, msg);

            if (err) {
                self.log.error(err, msg);
            }

            callback(newErr);
            return;
        }

        /*
         * If we got this far, ntpd_available should always have been set by the
         * backend. If it wasn't we should have returned in the condition above.
         */
        mod_assert.object(ntpData, 'ntpData');
        mod_assert.equal(ntpData.ntpd_available, 1,
             'should always have set ntpd_available');

        mod_assert.object(ntpData.system, 'ntpData.system');

        /* Add system metrics. */
        sysMetricKeys = Object.keys(NTP_SYSTEM_METRICS);
        for (idx = 0; idx < sysMetricKeys.length; idx++) {
            sysMetric = sysMetricKeys[idx];

            if (!NTP_SYSTEM_METRICS[sysMetric].enabled) {
                continue;
            }

            pushMetric(metrics, NTP_SYSTEM_METRICS, ntpData.system,
                sysMetric);
        }

        /* Add syspeer metrics. */
        if (ntpData.hasOwnProperty('syspeer')) {
            sysPeerMetricKeys = Object.keys(NTP_SYSPEER_METRICS);
            for (idx = 0; idx < sysPeerMetricKeys.length; idx++) {
                sysPeerMetric = sysPeerMetricKeys[idx];

                if (!NTP_SYSPEER_METRICS[sysPeerMetric].enabled) {
                    continue;
                }

                pushMetric(metrics, NTP_SYSPEER_METRICS, ntpData.syspeer,
                    sysPeerMetric);
            }
        }

        /* Add other peer metrics */
        if (ntpData.hasOwnProperty('peers')) {
            peerKeys = Object.keys(ntpData.peers);
            peerMetricKeys = Object.keys(NTP_PEER_METRICS);

            for (peerIdx = 0; peerIdx < peerKeys.length; peerIdx++) {
                peerInfo = ntpData.peers[peerKeys[peerIdx]];

                for (idx = 0; idx < peerMetricKeys.length; idx++) {
                    peerMetric = peerMetricKeys[idx];

                    if (!NTP_PEER_METRICS[peerMetric].enabled) {
                        continue;
                    }

                    mod_assert.string(peerInfo.remote, 'peerInfo.remote');

                    pushMetric(metrics, NTP_PEER_METRICS, peerInfo,
                        peerMetric, '{remote="' + peerInfo.remote + '"}');
                }
            }
        }

        callback(null, metrics);
    });
};

NtpMetricCollector.prototype.cacheTTL = function cacheTTL() {
    return (NTP_METRIC_TTL);
};

module.exports = NtpMetricCollector;
