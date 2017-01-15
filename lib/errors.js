/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */
'use strict';

var mod_restify = require('restify');
var mod_util = require('util');

var RestError = mod_restify.RestError;

function CMONAgentError(obj) {
    obj.constructorOpt = this.constructor;
    RestError.call(this, obj);
}
mod_util.inherits(CMONAgentError, RestError);

module.exports = {
    CMONAgentError: CMONAgentError,
    NotFoundError: mod_restify.NotFoundError,
    InternalServerError: mod_restify.InternalServerError
};
