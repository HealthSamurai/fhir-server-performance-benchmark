#!/usr/bin/env bash
# Post-run parity checks: prove servers actually did the same work.
#
# Run AFTER ./runner.sh -t /k6/import.js, from the compose host.
# Usage: ./scripts/parity-check.sh [server ...]      (default: all)
#
# Checks per server:
#   1. persisted resource counts        -> did the import really land?
#   2. urn:uuid leakage in references   -> were bundle refs resolved?
#   3. bundle.total in default search   -> is the server paying for COUNT?
#   4. lenient-drop probe               -> is a search param silently ignored?
#   5. validation probe                 -> is an invalid resource rejected?

set -u

SERVERS="${*:-aidbox hapi medplum microsoft octofhir}"

# Host-published ports from docker-compose.yaml. medplum publishes none, so it is
# reachable only from inside the compose network — run this script with
# `docker compose run --rm --entrypoint /bin/sh k6` and swap to service names if
# medplum is in scope.
base_url() {
  case "$1" in
    aidbox)    echo "http://localhost:13080/fhir" ;;
    hapi)      echo "http://localhost:13090/fhir" ;;
    microsoft) echo "http://localhost:13100" ;;
    medplum)   echo "http://medplum:8103/fhir/R4" ;;
    octofhir)  echo "http://localhost:13070/fhir" ;;
    *)         echo "" ;;
  esac
}

# medplum needs a token; everything else is unauthenticated in this compose.
auth_header() {
  case "$1" in
    medplum) echo "" ;;   # TODO: paste a bearer token here if medplum is in scope
    *)       echo "" ;;
  esac
}

j() { jq -r "$1" 2>/dev/null; }

for s in $SERVERS; do
  BASE="$(base_url "$s")"
  [ -z "$BASE" ] && { echo "skip unknown server: $s"; continue; }
  echo "=================================================="
  echo "$s  ($BASE)"
  echo "=================================================="

  echo "-- 1. persisted counts"
  for rt in Patient Encounter Observation MedicationRequest Practitioner Organization; do
    n=$(curl -sf "$BASE/$rt?_summary=count&_total=accurate" | j '.total // "n/a"')
    printf '   %-18s %s\n' "$rt" "$n"
  done

  echo "-- 2. reference resolution (expect Patient/<id>, NOT urn:uuid:...)"
  curl -sf "$BASE/Observation?_count=1" \
    | j '.entry[0].resource | "   subject=\(.subject.reference // "none")  encounter=\(.encounter.reference // "none")"'

  echo "-- 3. total in default search (no _total param)"
  curl -sf "$BASE/Patient?_count=20" \
    | j '"   bundle.total=\(.total // "ABSENT -> no COUNT executed")"'

  echo "-- 4. lenient-drop probe (filtered count must be < unfiltered count)"
  all=$(curl -sf "$BASE/Observation?_summary=count&_total=accurate" | j '.total // 0')
  for q in 'value-quantity=gt100' 'code-value-quantity=8867-4$gt100' 'combo-value-quantity=gt100'; do
    f=$(curl -sf --get "$BASE/Observation" \
          --data-urlencode "${q%%=*}=${q#*=}" \
          --data-urlencode '_summary=count' \
          --data-urlencode '_total=accurate' | j '.total // "err"')
    flag=""
    [ "$f" = "$all" ] && flag="  <== IGNORED (lenient drop)"
    [ "$f" = "0" ] && flag="  <== ZERO HITS (recall bug?)"
    printf '   %-38s %s / %s%s\n' "$q" "$f" "$all" "$flag"
  done

  echo "-- 5. validation probe (Observation missing required status+code)"
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/Observation" \
    -H 'Content-Type: application/fhir+json' \
    -d '{"resourceType":"Observation","valueString":"x"}')
  verdict="rejected (validating)"
  case "$code" in 200|201) verdict="ACCEPTED -> NOT validating" ;; esac
  echo "   POST invalid Observation -> HTTP $code  ($verdict)"

  echo
done
