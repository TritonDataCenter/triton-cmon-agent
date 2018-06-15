/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2018 Joyent, Inc.
 */
'use strict';

var mod_assert = require('assert-plus');

var MSEC_PER_SEC = 1000;
var NS_PER_SEC = 1e9;
var POLL_INTERVAL_MSEC = 300000;

/*
 * Instantiates a new Cache object with the given opts object
 *
 * Example opts object: { log: yourLogger }
 *
 * The Cache object has properties:
 *
 *  _items            This is an object with properties named after the cache
 *                    keys, and the value will be a cache object. E.g.:
 *
 *                    self._items[key] = {
 *                        value: value,
 *                        TTL: msecTTL,
 *                        date: <epoch timestamp>
 *                    };
 *
 *
 * _recentlyUsedKeys  This exists as an optimization. When we insert an entry
 *                    into the cache, we also push the key onto the bottom of
 *                    the _recentlyUsedKeys array and remove any earlier entries
 *                    in the array. Since we know we're always adding to the
 *                    bottom, when we're expiring, we can start from the top and
 *                    as soon as we hit the first entry that's *not* expired,
 *                    we're done since all entries below that will have been
 *                    updated more recently (and therefore are not expired).
 *
 *                    For this to work, we have to bucket by TTL since otherwise
 *                    we could end up adding an entry with a 5s TTL then a 10s
 *                    TTL and then another 5s entry. In that case, the 10s TTL
 *                    entry might not have expired when we sweep even though the
 *                    5s entry below it might have. With the items bucketed, we
 *                    avoid that problem since any 5s TTL entries coming after
 *                    the first non-expired one in the 5s bucket, will also not
 *                    be expired.
 *
 */
function Cache(opts) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.log, 'opts.log');
    mod_assert.optionalObject(opts.metricsManager, 'opts.metricsManager');

    var self = this;
    self._items = {};
    self._recentlyUsedKeys = {};
    self._log = opts.log;
    self.sweepCount = 0;
    self.totalSweepSeconds = 0;

    if (opts.metricsManager !== undefined) {
        self.cachedItemsGauge = opts.metricsManager.collector.gauge({
            name: 'cached_items',
            help: 'Number of items in the cache'
        });

        self.cacheHits = opts.metricsManager.collector.counter({
            name: 'cache_get_hits_total',
            help: 'Total number of gets that resulted in cache hits'
        });

        self.cacheGets = opts.metricsManager.collector.counter({
            name: 'cache_gets_total',
            help: 'Total number of attempts to get data from the cache'
        });

        opts.metricsManager.createMetrics('cache', function _getCacheItems() {
            self.cachedItemsGauge.set(Object.keys(self._items).length);
        });
    }

    function _doSweep() {
        self._sweep();
        _scheduleSweep();
    }

    /* Schedules the next sweep for POLL_INTERVAL_MSEC in the future. */
    function _scheduleSweep() {
        setTimeout(_doSweep, POLL_INTERVAL_MSEC).unref();
    }

    /* Schedule the first sweep now. Which will schedule the next, etc. */
    _scheduleSweep();
}

/* Calculate the item expiration from its date and TTL properties */
function _calculateExpiration(item) {
    mod_assert.object(item, 'item');
    mod_assert.number(item.date, 'item.date');
    mod_assert.number(item.TTL, 'item.TTL');

    return item.date + item.TTL;
}

Cache.prototype._sweep = function _sweep(opts) {
    mod_assert.optionalObject(opts, 'opts');
    if (opts !== undefined) {
        mod_assert.optionalNumber(opts.now, 'opts.now');
    }

    var self = this;
    var bucket;
    var bucketKeys = Object.keys(self._recentlyUsedKeys);
    var bucketKeyCount = bucketKeys.length;
    var deletedBuckets = 0;
    var deletes = 0;
    var deleteTo = 0;
    var delta;
    var elapsedSeconds;
    var i;
    var item;
    var itemCountAfter = 0;
    var itemCountBefore = 0;
    var j;
    /* allow overriding 'now' for testing */
    var now = (opts !== undefined && opts.now) || Date.now();
    var sweepNumber = ++self.sweepCount;
    var startSweep = process.hrtime();

    self._log.trace({
        sweepNumber: sweepNumber
    }, 'starting sweep');

    for (i = 0; i < bucketKeyCount; i++) {
        bucket = self._recentlyUsedKeys[bucketKeys[i]];

        /*
         * If the bucket length is 0, that means we once had items in it but
         * don't any longer. Most likely this means someone was polling for
         * some metrics and stopped. We'll remove the bucket and it can get
         * re-added automatically if they start polling again.
         */
        if (bucket.length === 0) {
            delete self._recentlyUsedKeys[bucketKeys[i]];
            deletedBuckets++;
            continue;
        }

        itemCountBefore += bucket.length;

        for (j = 0; j < bucket.length; j++) {
            item = self._items[bucket[j]];
            if (item && (_calculateExpiration(item) <= now)) {
                delete self._items[bucket[j]];
                deletes++;
            } else {
                /*
                 * This breaks at the first non-expired key. We mark this index
                 * so we can delete all the elements up to this one. (Those were
                 * expired).
                 */
                deleteTo = j;
                break;
            }
        }

        /* Delete any expired keys from the head of _recentlyUsedKeys */
        if (deleteTo > 0) {
            bucket.splice(0, deleteTo);
        }
    }

    /* Now that we've done a cleanup, just confirm what we have left. */
    for (i = 0; i < bucketKeyCount; i++) {
        bucket = self._recentlyUsedKeys[bucketKeys[i]];
        itemCountAfter += Object.keys(bucket).length;
    }

    delta = process.hrtime(startSweep);
    elapsedSeconds = (delta[0] * NS_PER_SEC + delta[1]) / NS_PER_SEC;
    self.totalSweepSeconds += elapsedSeconds;

    /*
     * NOTE: in the future it'd make sense to include some of these as
     * GZ metrics.
     */
    self._log.trace({
        deletedBuckets: deletedBuckets,
        deletes: deletes,
        elapsed: elapsedSeconds,
        itemCountAfter: itemCountAfter,
        itemCountBefore: itemCountBefore,
        sweepNumber: sweepNumber,
        totalSweepSeconds: self.totalSweepSeconds
    }, 'sweep complete');
};

/*
 * Fetches the value which corresponds to the given key. In the case of an error
 * the value will be undefined and an error object will be returned.
 */
Cache.prototype.get = function get(key, opts, cb) {
    var self = this;
    var err;
    var expired;
    var item;
    var result;
    var now;

    /* support calling get(key, cb) when there are no opts (backward compat) */
    if (typeof (opts) === 'function' && cb === undefined) {
        cb = opts;
        opts = {};
    }

    mod_assert.string(key, 'key');
    mod_assert.object(opts, 'opts');
    mod_assert.optionalNumber(opts.now, 'opts.now');
    mod_assert.func(cb, 'cb');

    /* allow overriding 'now' for testing */
    now = opts.now || Date.now();

    if (self.cacheGets !== undefined) {
        self.cacheGets.increment();
    }

    item = self._items[key];
    if (item) {
        self._log.trace({item: item}, 'item');
        expired = _calculateExpiration(item) <= now;
        if (expired) {
            err = new Error('Not found');
            err.code = 'ENOTFOUND';
            delete self._items[key];
        } else {
            result = self._items[key].value;
            if (self.cacheHits !== undefined) {
                self.cacheHits.increment();
            }
        }
    } else {
        err = new Error('Not found');
        err.code = 'ENOTFOUND';
    }

    cb(err, result);
};

/*
 * Inserts a key-value pair into the cache with the given TTL. If the key-value
 * pair already exists in the cache then it will be overwritten.
 */
Cache.prototype.insert = function insert(key, value, TTL, opts) {
    var self = this;
    mod_assert.string(key, 'key');
    mod_assert.ok(value || value === '', 'value');
    mod_assert.number(TTL, 'TTL must be a number');
    mod_assert.ok(Number.isInteger(TTL), 'TTL must be an integer');
    mod_assert.ok(TTL > 0, 'TTL must be positive');
    mod_assert.optionalObject(opts, 'opts');
    if (opts !== undefined) {
        mod_assert.optionalNumber(opts.now, 'opts.now');
    }

    var bucket;
    var idx = 0;
    var msecTTL = TTL * MSEC_PER_SEC;
    var msTTLstr;
    /* allow overriding 'now' for testing */
    var now = (opts !== undefined && opts.now) || Date.now();

    self._items[key] = {
        value: value,
        TTL: msecTTL,
        date: now
    };

    msTTLstr = msecTTL.toString();
    self._recentlyUsedKeys[msTTLstr] = self._recentlyUsedKeys[msTTLstr] || [];

    // remove any existing entries
    bucket = self._recentlyUsedKeys[msTTLstr];
    while ((idx = bucket.indexOf(key, idx)) !== -1) {
        bucket.splice(idx, 1);
    }

    bucket.push(key);
};

/*
 * Removes the key-value pair which corresponds to the given key. Returns true
 * if the key-value par was removed. In the case of an error the value will be
 * undefined and an error object will be returned.
 */
Cache.prototype.remove = function remove(key, cb) {
    var self = this;
    var bucket;
    var err;
    var idx = 0;
    var msTTLstr;
    var result;

    mod_assert.string(key, 'key');
    if (self._items[key]) {
        msTTLstr = self._items[key].TTL.toString();
        delete self._items[key];

        /* Also remove from the _recentlyUsedKeys array. */
        bucket = self._recentlyUsedKeys[msTTLstr];
        while ((idx = bucket.indexOf(key, idx)) !== -1) {
            bucket.splice(idx, 1);
        }

        result = true;
    } else {
        err = new Error('Not found');
        err.code = 'ENOTFOUND';
    }

    cb(err, result);
};

module.exports = Cache;
