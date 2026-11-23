#!/bin/sh
set -eu

config=/tmp/octofhir-benchmark.toml
awk '
    /^\[server\]$/ { print; print "outbound_allowlist = [\"rustfs\"]"; next }
    { print }
' /opt/octofhir/config/octofhir.toml > "$config"

cat >> "$config" <<'TOML'

[bulk_export.s3]
provider = "benchmark-rustfs"
bucket = "octofhir-export"

[[storage_providers]]
id = "benchmark-rustfs"
type = "s3"
endpoint = "http://rustfs:9000"
region = "us-east-1"
addressingStyle = "path"
allowHttp = true
exportBuckets = ["octofhir-export"]

[storage_providers.credentials]
type = "environment"
accessKeyIdEnv = "RUSTFS_ACCESS_KEY"
secretAccessKeyEnv = "RUSTFS_SECRET_KEY"
TOML

export OCTOFHIR_CONFIG="$config"
exec octofhir-server
