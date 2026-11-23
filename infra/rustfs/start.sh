#!/bin/sh
# Entrypoint of the rustfs service (docker-compose.yaml): starts RustFS, creates
# the export bucket and opens it to anonymous object read/write/list/delete
# (bucket-level admin stays root-only), so k6 can list and clean up exports with
# plain unsigned HTTP. /tmp/bucket-ready gates the healthcheck.
#
# Done here rather than in a one-shot init container: `docker compose up --wait`
# (compose v5.0, as in CI) fails on a one-shot container that nothing depends
# on, even when it exits 0. And the bucket lives on the tmpfs, so it is created
# again whenever the container restarts. The image's own bootstrap
# (/etc/rustfs/bootstrap) can't do it: its bundled rc lacks the
# public-access-block command it calls.
set -e

/etc/rustfs/entrypoint.sh rustfs &
pid=$!
trap 'kill -TERM "$pid" 2>/dev/null; wait "$pid"; exit' TERM INT

until curl -fsS -o /dev/null http://127.0.0.1:9000/health/ready; do
  kill -0 "$pid" 2>/dev/null || { echo "rustfs exited before becoming ready" >&2; exit 1; }
  sleep 1
done

export RC_HOST_perf="http://$RUSTFS_ACCESS_KEY:$RUSTFS_SECRET_KEY@127.0.0.1:9000"
rc bucket create perf/fhir-export --ignore-existing
rc bucket anonymous set-json /opt/perf/export-bucket-policy.json perf/fhir-export
touch /tmp/bucket-ready
echo "export bucket fhir-export is ready"

wait "$pid"
