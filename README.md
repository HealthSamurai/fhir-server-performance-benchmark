# FHIR Server Performance Benchmark

[![Build Status](https://drone-ci.aidbox.app/api/badges/HealthSamurai/fhir-server-performance-benchmark/status.svg)](https://drone-ci.aidbox.app/HealthSamurai/fhir-server-performance-benchmark)

[Reports](https://healthsamurai.github.io/fhir-server-performance-benchmark)


## FHIR Servers

- Aidbox — JVM, PostgreSQL
- HAPI FHIR — JVM, PostgreSQL
- Medplum — Node.js (×8 replicas), PostgreSQL + Redis
- Microsoft FHIR — .NET R4, SQL Server 2022
- WSO2 FHIR — Go, PostgreSQL
- InterSystems IRIS for Health — Community Edition, embedded IRIS database

Aidbox, HAPI, Medplum and WSO2 share one PostgreSQL instance (a database per server).
The Microsoft FHIR server only supports SQL Server, so it runs against its own
dedicated SQL Server. InterSystems IRIS for Health stores FHIR data in its own
embedded database, so it is a single container. Tests run sequentially, so only
one server + database pair is under load at a time.

## Local development

```sh
./runner.sh bootstrap
```

Open [http://localhost:13080](http://localhost:13080) and activate Aidbox.

### Infrastructure

| Services       | Local address                                    | Internal address |
|----------------|--------------------------------------------------|------------------|
| Aidbox         | [http://localhost:13080](http://localhost:13080) | [http://aidbox:8080](http://aidbox:8080) |
| HAPI           | [http://localhost:13090](http://localhost:13090) | [http://hapi:8080](http://hapi:8080) |
| Medplum        | - | [http://medplum:8103](http://medplum:8103) |
| Microsoft FHIR | [http://localhost:13100](http://localhost:13100) | [http://microsoft:8080](http://microsoft:8080) |
| WSO2 FHIR      | [http://localhost:13110](http://localhost:13110) | [http://wso2:9090](http://wso2:9090) |
| InterSystems IRIS for Health | [http://localhost:13120/fhir/r4](http://localhost:13120/fhir/r4) | [http://intersystems:52773/fhir/r4](http://intersystems:52773/fhir/r4) |
| RustFS (S3)    | [http://localhost:13130](http://localhost:13130), console [http://localhost:13131](http://localhost:13131) | [http://rustfs:9000](http://rustfs:9000) |
| Azurite (Azure Blob) | [http://localhost:13140](http://localhost:13140) | [http://azurite:10000/devstoreaccount1](http://azurite:10000/devstoreaccount1) |
| Grafana        | [http://localhost:13000](http://localhost:13000) | [http://grafana:3000](http://grafana:3000) |
| Prometheus     | [http://localhost:13010](http://localhost:13010) | [http://prometheus:9090](http://prometheus:9090) |

InterSystems IRIS for Health serves only `metadata` without authentication; use HTTP Basic auth `fhir` / `fhir`.


## Running benchmarks with `runner.sh`

`runner.sh` is the entry point for bringing up the stack and running the k6 load
tests. Each test runs inside the `k6` container and streams its results to
Prometheus via remote-write, so you can watch them live in Grafana.

### Bootstrap the stack

Pull images and start all services (FHIR servers, databases, monitoring):

```sh
./runner.sh bootstrap
```

### Run a test

```sh
./runner.sh -t <test> [-s <server>] [-id <runId>] [-f <compose-file> ...]
```

| Flag  | Description                                                                    |
|-------|--------------------------------------------------------------------------------|
| `-t`  | Test file to run: `/k6/prewarm.js`, `/k6/crud.js`, `/k6/import.js`, `/k6/search.js`, `/k6/export.js` (default: `/k6/prewarm.js`) |
| `-s`  | Target server: `aidbox`, `hapi`, `medplum`, `microsoft`, `wso2`, `intersystems`. Omit to run on **all** servers sequentially |
| `-id` | Run ID that tags the metrics. Defaults to the current UTC timestamp (or the `RUNID` env var) |
| `-f`  | Extra Docker Compose file(s); repeatable. Defaults to `docker-compose.yaml`     |

The `-s`/`fhirimpl` tag and `-id`/`runid` tag are what the report snapshot later
queries from Prometheus, so keep the same `-id` across a run's tests.

### Examples

```sh
# Full run against every server (prewarm, then the four suites)
./runner.sh -t /k6/prewarm.js
./runner.sh -t /k6/crud.js
./runner.sh -t /k6/import.js
./runner.sh -t /k6/search.js
./runner.sh -t /k6/export.js

# CRUD on Aidbox only, with a custom run ID
./runner.sh -t /k6/crud.js -s aidbox -id my-test-run

# Reuse one run ID across suites so they land in the same report
RUNID=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
./runner.sh -t /k6/crud.js   -id "$RUNID"
./runner.sh -t /k6/import.js -id "$RUNID"
```

Run `./runner.sh -h` for the full built-in help. Turning the collected metrics
into a report is done separately — see `scripts/generate-snapshot.js`.


## Coverage

CRUD

- [x] Create
- [x] Read
- [x] Update
- [x] Delete

Bulk import

- [x] FHIR bundle

Search

- [x] Simple search (string, date, token, quantity)
- [x] Complex search (composite, reference, modifiers, prefixes)

Bulk export

- [x] System-level `$export` of the imported dataset to NDJSON, MB/s

## Bulk export

`k6/export.js` runs one system-level `$export` per server as a single long k6
iteration: kick-off, poll the status URL every 2s, then measure the output.
The headline metric is **MB/s** — NDJSON bytes divided by the time from the
kick-off to the completed manifest (1 MB = 10^6 bytes). Export duration and
output size go to the report too; the Grafana dashboard shows live progress.
It runs after the search suite, on the dataset loaded by `import.js`.

| Server | `$export` | Output goes to | Measured from |
|---|---|---|---|
| Aidbox | yes | RustFS (`AwsAccount` "rustfs" in `infra/aidbox/initbundle.json`) | bucket |
| Medplum | yes | RustFS (`binaryStorage: s3:fhir-export`; endpoint via `AWS_ENDPOINT_URL_S3`) | bucket |
| HAPI | yes | its own database, as `Binary` resources (no S3 support) | manifest (file sizes) |
| Microsoft FHIR | yes | Azurite — it exports only to Azure Blob Storage | container |
| WSO2 | no (2.2.0: `/$export` is answered as a search, `Patient/$export` is 404) | — | **Not supported** |
| InterSystems IRIS | not on the FHIR endpoint (needs a separate Bulk FHIR Coordinator) | — | **Not supported** |

`runner.sh` skips the unsupported servers, and the report shows them as
"Not supported" rather than as zero (`EXPORT_NOT_SUPPORTED` in
`scripts/benchmark-converter.js`).

[RustFS](https://rustfs.com) is the S3-compatible sink. It keeps its data on a
tmpfs (no volume, nothing on the host disk), and `export.js` empties the
`fhir-export` bucket before and after every server. Azurite, the sink for
Microsoft FHIR, keeps blobs in memory the same way; `export.js` signs its
requests with an account SAS made from the emulator's well-known dev key and
drops the `fhir-export` container after the run. The bucket has an anonymous
policy for object read/write/list/delete, so k6 talks to it with plain unsigned
HTTP. FHIR servers whose S3 client always signs requests use the root keys
`rustfsadmin` / `rustfsadmin` (a signature with an unknown key is rejected even
on a public bucket).
