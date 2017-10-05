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
