# cmon-agent

The cmon-agent runs on all Triton nodes and is responsible for responding to
[CMON](https://github.com/joyent/triton-cmon) requests for individual container
metrics.

# The cmon-agent exposes the following HTTP API:

## List VM Metrics (GET /v1/:vmuuid/metrics)

Retrieve Prometheus text format data to be consumed by CMON

### Responses

| Code | Description    | Response                         |
| ---- | -------------- | -------------------------------- |
| 200  | Response OK    | Prometheus text formatted output |
| 404  | VM not found   | Not found error string           |
| 500  | Internal Error | Internal error string            |

### Example
```
GET /v1/:vmuuid/metrics
---
# HELP cpu_user_usage User CPU utilization in nanoseconds
# TYPE cpu_user_usage counter
cpu_user_usage 58708613676893
# HELP cpu_sys_usage System CPU usage in nanoseconds
# TYPE cpu_sys_usage counter
cpu_sys_usage 1038097374124
# HELP cpu_wait_time CPU wait time in nanoseconds
# TYPE cpu_wait_time counter
cpu_wait_time 45339636199651
# HELP load_average Load average
# TYPE load_average gauge
load_average 0.08203125
# HELP mem_agg_usage Aggregate memory usage in bytes
# TYPE mem_agg_usage gauge
mem_agg_usage 773136384
# HELP mem_limit Memory limit in bytes
# TYPE mem_limit gauge
mem_limit 1073741824
# HELP mem_swap Swap in bytes
# TYPE mem_swap gauge
mem_swap 756899840
# HELP mem_swap_limit Swap limit in bytes
# TYPE mem_swap_limit gauge
mem_swap_limit 4294967296
# HELP net_agg_packets_in Aggregate inbound packets
# TYPE net_agg_packets_in counter
net_agg_packets_in 15049090
# HELP net_agg_packets_out Aggregate outbound packets
# TYPE net_agg_packets_out counter
net_agg_packets_out 17990025
# HELP net_agg_bytes_in Aggregate inbound bytes
# TYPE net_agg_bytes_in counter
net_agg_bytes_in 3391704695
# HELP net_agg_bytes_out Aggregate outbound bytes
# TYPE net_agg_bytes_out counter
net_agg_bytes_out 13568526824
# HELP zfs_used zfs space used in bytes
# TYPE zfs_used gauge
zfs_used 2213482496
# HELP zfs_available zfs space available in bytes
# TYPE zfs_available gauge
zfs_available 24630063104
# HELP time_of_day System time in seconds since epoch
# TYPE time_of_day counter
time_of_day 1485217771997
```


## List GZ Metrics (GET /v1/gz/metrics)

Retrieve Prometheus text format data to be consumed by CMON

### Responses

| Code | Description    | Response                         |
| ---- | -------------- | -------------------------------- |
| 200  | Response OK    | Prometheus text formatted output |
| 404  | VM not found   | Not found error string           |
| 500  | Internal Error | Internal error string            |

### Example
```
GET /v1/gz/metrics
---
# HELP arcstats_anon_evictable_data_bytes ARC anonymous evictable data
# TYPE arcstats_anon_evictable_data_bytes gauge
arcstats_anon_evictable_data_bytes 0
# HELP arcstats_anon_evictable_metadata_bytes ARC anonymous evictable metadata
# TYPE arcstats_anon_evictable_metadata_bytes gauge
arcstats_anon_evictable_metadata_bytes 0
# HELP arcstats_anon_size_bytes ARC anonymous size
# TYPE arcstats_anon_size_bytes gauge
arcstats_anon_size_bytes 23246336
# HELP arcstats_arc_meta_limit_bytes ARC metadata limit
# TYPE arcstats_arc_meta_limit_bytes gauge
arcstats_arc_meta_limit_bytes 2852140032
# HELP arcstats_arc_meta_max_bytes ARC metadata maximum observed size
# TYPE arcstats_arc_meta_max_bytes gauge
arcstats_arc_meta_max_bytes 896866192
# HELP arcstats_arc_meta_min_bytes ARC metadata minimum
# TYPE arcstats_arc_meta_min_bytes gauge
arcstats_arc_meta_min_bytes 713035008
# HELP arcstats_arc_meta_used_bytes ARC metadata used
# TYPE arcstats_arc_meta_used_bytes gauge
arcstats_arc_meta_used_bytes 613959304
# HELP arcstats_target_cache_size_bytes ARC target cache size
# TYPE arcstats_target_cache_size_bytes gauge
arcstats_target_cache_size_bytes 2628193792
# HELP arcstats_max_target_cache_size_bytes ARC maximum target cache size
# TYPE arcstats_max_target_cache_size_bytes gauge
arcstats_max_target_cache_size_bytes 11408560128
# HELP arcstats_min_target_cache_size_bytes ARC minimum target cache size
# TYPE arcstats_min_target_cache_size_bytes gauge
arcstats_min_target_cache_size_bytes 1426070016
# HELP arcstats_compressed_size_bytes ARC compressed size
# TYPE arcstats_compressed_size_bytes gauge
arcstats_compressed_size_bytes 2171045376
# HELP arcstats_data_size_bytes Number of bytes consumed by ARC buffers backing on disk data
# TYPE arcstats_data_size_bytes gauge
arcstats_data_size_bytes 2024793088
# HELP arcstats_demand_data_hits_total ARC demand data hits
# TYPE arcstats_demand_data_hits_total counter
arcstats_demand_data_hits_total 27909081
# HELP arcstats_demand_data_misses_total ARC demand data misses
# TYPE arcstats_demand_data_misses_total counter
arcstats_demand_data_misses_total 5937356166
# HELP arcstats_demand_hit_predictive_prefetch_total ARC demand hit predictive prefetch
# TYPE arcstats_demand_hit_predictive_prefetch_total counter
arcstats_demand_hit_predictive_prefetch_total 3493859
```


## Refresh (POST /v1/refresh)

Causes the agent to refresh its mapping of vmuuid to zoneid. This is normally
only called by CMON. An operator could use this endpoint for diagnostic
purposes.

### Responses

| Code | Description    | Response                         |
| ---- | -------------- | -------------------------------- |
| 200  | Response OK    | Empty                            |
| 404  | VM not found   | Not found error string           |
| 500  | Internal Error | Internal error string            |

### Example
```
POST /v1/refresh
---
```

## Installing

```
[root@headnode (hn) ~]$ sdcadm self-update --latest
[root@headnode (hn) ~]$ sdcadm experimental add-new-agent-svcs
[root@headnode (hn) ~]$ sdcadm experimental update-agents --latest --all
```

## Manual verification of functionality

### Testing /v1/:vmuuid/metrics

```
[root@node ~]$ curl http://<cn_admin_ip>:9163/v1/<vm_uuid>/metrics
```

#### Healthy
* 200 OK with Prometheus text
```
# HELP cpu_user_usage User CPU utilization in nanoseconds
# TYPE cpu_user_usage counter
cpu_user_usage 58890804324187
...
```

#### Unhealthy
* 500 Internal Error
```
Internal error
```
* Hang

### Testing /v1/refresh

```
[root@node ~]$ curl -X POST http://<cn_admin_ip>9163/v1/refresh
```

#### Healthy
* 200 OK (empty response body)

#### Unhealthy
* 500 Internal Error
```
Internal error
```

### Checking logs

```
[root@node ~]$ tail -f `svcs -L cmon-agent` | bunyan --color
```

* Check for ERROR and WARN output

# Terminology

`cmon-agent` includes a number of `collectors`. A `collector` is a node.js
module living in one of the directories:

 * lib/instrumenter/collectors-gz (run only for the global zone (GZ))
 * lib/instrumenter/collectors-vm (run only for non global zones/VMs)
 * lib/instrumenter/collectors-common (these are run for both GZ and VMs)

Each of the collectors loads one or more `metrics`. A `metric` is a single
datapoint such as:

```
# HELP load_average Load average
# TYPE load_average gauge
load_average 0
```

a metric may have multiple instances by way of labels. This could look for
example like:

```
# HELP net_agg_bytes_in Aggregate inbound bytes
# TYPE net_agg_bytes_in counter
net_agg_bytes_in{interface="vnic0"} 335015193
net_agg_packets_in{interface="vnic1"} 72116
net_agg_bytes_out{interface="vnic1"} 420506
net_agg_packets_out{interface="vnic1"} 5990
net_agg_bytes_in{interface="vnic1"} 7759058
```

you can see here that a single metric (`net_agg_bytes_in`) can have two
different instances in the output each with their own labels
`{interface="vnic0"}` and `{interface="vnic1"}` here.

It is possible for one of these collectors to have `subcollectors`. In this
case, a collector may actually pull together several different components using
the same mechanism. The only collector that does this currently is the `plugin`
collector. The use of the `plugin` collector is described in more detail below,
but this collector is able to run a series of operator-defined scripts, each of
which are able to generate metrics. Each script it executes is called a
`plugin` but to cmon-agent, the `plugin` collector has several subcollectors,
one for each plugin.

# Plugins

The "plugin" collector adds support for operator-supplied plugins. These are
expected to be especially useful when:

 * cmon-agent doesn't yet have support for a given metric
 * experimenting
 * temporary metrics while debugging

They are not intended to be a full replacement for cmon-agent's collectors, so
it is expected that when metrics which would be of interest to all Triton
customers are installed as plugins, one has also filed a ticket for adding such
metrics to cmon-agent for general use.

If you have decided a plugin is the best choice, the rest of this section will
explain how to use them.

## Preparing for using plugins

To use plugins you need to create one or both of the directories:

 * /opt/custom/cmon/gz-plugins/ (for plugins that load GZ information)
 * /opt/custom/cmon/vm-plugins/ (for plugins that load VM information)

both of these are optional. If neither exists, no plugins will be executed.
The directories must be owned by `root`.

## Using plugins

Once you have created the proper directories, you can create plugins by copying
executables into the appropriate plugin directory. For example, if you had a
plugin `meaning` that you wanted to add to collect GZ metrics, you would create
the file:

```
/opt/custom/cmon/gz-plugins/meaning
```

which should be executable and owned by `root`. On the next reload, this plugin
will be loaded and metrics will begin to be included in the:

```
/v1/gz/metrics
```

output. For example, if this meaning plugin looked like:

```
[root@headnode (coal) ~]# ls -l /opt/custom/cmon/gz-plugins/meaning
-rwxr-xr-x   1 root     root         133 Nov 30 05:26 /opt/custom/cmon/gz-plugins/meaning
[root@headnode (coal) ~]# cat /opt/custom/cmon/gz-plugins/meaning
#!/bin/bash

ANSWER=42

printf "life\tgauge\t%d\tThe answer to the ultimate question of life, the universe and everything\n" $ANSWER
[root@headnode (coal) ~]#
```

then a query to:

```
/v1/gz/metrics
```

would include:

```
...
# HELP plugin_meaning_life The answer to the ultimate question of life, the universe and everything
# TYPE plugin_meaning_life gauge
plugin_meaning_life 42
...
```

in the output. Note that this includes the `plugin_` prefix to namespace the
plugins, followed by the `meaning_` prefix to indicate the name of the plugin.

Since these plugins are run through the normal collector framework, you will
also see in the output something like:

```
# HELP plugin_meaning_metrics_available_boolean Whether plugin_meaning metrics were available, 0 = false, 1 = true
# TYPE plugin_meaning_metrics_available_boolean gauge
plugin_meaning_metrics_available_boolean 1
# HELP plugin_meaning_metrics_cached_boolean Whether plugin_meaning metrics came from cache, 0 = false, 1 = true
# TYPE plugin_meaning_metrics_cached_boolean gauge
plugin_meaning_metrics_cached_boolean 0
# HELP plugin_meaning_metrics_timer_seconds How long it took to gather the plugin_meaning metrics
# TYPE plugin_meaning_metrics_timer_seconds gauge
plugin_meaning_metrics_timer_seconds 0.069582708
```

per the timers and availability metric info from [CMON-92](https://jira.joyent.us/browse/CMON-92).

## Plugin Arguments

Each plugin will be passed a single command-line parameter. This parameter will
be the zonename of the zone for which to gather metrics. For the GZ metrics, the
zonename will be `global`.

## Plugin Output

Plugins should output only metrics to stdout. Any data written to stderr will be
written to the cmon-agent logs at bunyan's debug level.

The metric output should contain only lines with 3 or 4 tab-separated fields.
The order of these fields is:

 * metric name
 * metric type
 * metric value
 * metric help

and the last field (help) is optional. If no help is specified, the metric name
will be used as the help text.

Any blank lines in the stdout will be ignored.

Any non-blank lines which don't match the format described above (3 or 4
tab-separated fields) will cause a message to be written to the log, and no
metrics to be available from the plugin for this execution.

## Plugin Options

All plugins are run with a timeout. When the plugin takes longer than this
timeout to exit, it will be killed. The default timeout is hardcoded in the
plugin collector (currently 3s). If a plugin is expected to potentially take
longer than this, it can set a different timeout value. Note that this will
currently cause a significant delay in getting query results as cmon-agent waits
for all collectors (and plugins) to complete or timeout before returning
results.

All results are cached to prevent the system from being overloaded. The
default TTL for plugins is hardcoded in the plugin collector (currently 60
seconds). This means that when querying more freqently than this, the client
will receive the same data until the TTL has expired and the data is reloaded.
As discussed above, you can tell if the results came from cache or not for a
given plugin by looking at the:

```
plugin_<name>_<key>_cached_boolean
```

metric.

The timeout and ttl values can be adjusted for a plugin by creating a
`plugin.json` file in the plugin directory. For example, if you want to adjust
these values for the `meaning` plugin in the examples above, you'd create a
`plugin.json` file in /opt/ that looks like:

```
{
    "meaning": {
        "timeout": 100,
        "ttl": 60
    }
}
```

where ttl is a number of seconds, and timeout is a number of milliseconds. This
file will be reloaded for each non-cached plugin metric collection.

For TTL, there's one additional way to set a value for a given plugin, and that
is through a special metric. If your plugin includes a metric of type "option"
(as opposed to gauge or counter) with the name "ttl", the value will be set as
the TTL for your plugin. If your output contains multiple values like:

```
...
ttl	option	10
ttl	option	100
...
```

Only the last value will be used. Any help text will be ignored for these
options. Note also that the only supported `option` is `ttl`. You cannot set the
`timeout` value via the output of your plugin.

## Important Plugin Restrictions

 * If a plugin runs longer than its timeout, it will be killed.
 * If a plugin outputs more than `PLUGIN_MAX_OUTPUT` (10KiB currently) it will be killed.
 * If a plugin is not owned by root, it will not run.
 * If the plugin directory is now owned by root, plugins will not be loaded.
 * If the help text is missing (there are only 3 instead of 4 fields) the metric name will be used as the help text.
 * Plugins can cause delays for non-cached results.
 * It is up to the creator of the plugin to follow or not follow the prometheus naming guidelines: https://prometheus.io/docs/practices/naming/
 * cmon-agent makes an attempt to prevent plugins from breaking it or the system, but it's still easy for plugins to do bad things, and they run as root.
