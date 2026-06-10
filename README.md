# FHIR Server Performance Benchmark

[![Build Status](https://drone-ci.aidbox.app/api/badges/HealthSamurai/fhir-server-performance-benchmark/status.svg)](https://drone-ci.aidbox.app/HealthSamurai/fhir-server-performance-benchmark)

[Reports](https://healthsamurai.github.io/fhir-server-performance-benchmark)

## FHIR Server

- Aidbox
- Hapi
- Medplum

## Local development

```sh
./runner.sh bootstrap
```

Open [http://localhost:13080](http://localhost:13080) and activate Aidbox.

### Infrastructure

| Services   | Local address                                 | Internal address |
|------------|----------------------------------------|-----------------|
| Aidbox     | [http://localhost:13080](http://localhost:13080) | [http://aidbox:8080](http://aidbox:8080) |
| Hapi       | [http://localhost:13090](http://localhost:13090) | [http://hapi:8080](http://hapi:8080) |
| Medplum    | - | [http://medplum:8103](http://medplum:8103) |
| Grafana    | [http://localhost:13000](http://localhost:13000) | [http://grafana:3000](http://grafana:3000) |
| Prometheus | [http://localhost:13010](http://localhost:13010) | [http://prometheus:9090](http://prometheus:9090) |

## Coverage

CRUD

- [x] Create
- [x] Read
- [x] Update
- [x] Delete

Bulk import

- [x] FHIR bundle

Search

- [ ] Simple search
- [ ] Complex search
- [ ] Full text search

Validation

- [ ] Schema validation
- [ ] Terminology validation
- [ ] another
