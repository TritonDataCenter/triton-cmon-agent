<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2017, Joyent, Inc.
    Copyright 2022 MNX Cloud, Inc.
-->

# Triton Container Monitor Agent (cmon-agent)

This is the home of the compute node agent portion of the Triton Container
Monitor solution. Triton cmon-agent acts as if it is many individual
Prometheus node-exporters by supporting a polling route per container on the
compute node it resides on.

## Test

Tests must be run in the global zone of a machine with at least one non-global
zone.

```
make test
```

## Lint

```
make check
```

## Release

```
make release
```

## Documentation

For an overview of the Triton Container Monitor solution, please see
[RFD 27](https://github.com/TritonDataCenter/rfd/blob/master/rfd/0027/README.md#).

For documentation specific to cmon-agent, please see
[docs/README.md](docs/README.md).

## License

"Triton Container Monitor" is licensed under the
[Mozilla Public License version 2.0](http://mozilla.org/MPL/2.0/).
See the file LICENSE.
