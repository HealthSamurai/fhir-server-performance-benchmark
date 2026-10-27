#!/bin/bash
# Refreshes SQL table statistics of the FHIR storage tables — the IRIS
# counterpart of the `vacuumdb --analyze` CI runs on Postgres before the search
# suite. IRIS doesn't gather them by itself after the import: the tables keep
# install-time defaults, which the FHIR search queries are then planned with.
set -e

log=/tmp/gather-stats.log
if ! iris session "$ISC_PACKAGE_INSTANCENAME" -U FHIRSERVER > "$log" 2>&1 <<'EOF'
set n = 0
set rs = ##class(%SQL.Statement).%ExecDirect(, "SELECT DISTINCT TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA %STARTSWITH 'HSFHIR_'")
while rs.%Next() { set sc = ##class(%SYSTEM.SQL.Stats.Table).GatherSchemaStats(rs.%Get("TABLE_SCHEMA")) if $system.Status.IsError(sc) { do $system.OBJ.DisplayError(sc) do ##class(%SYSTEM.Process).Terminate(, 1) } set n = n + 1 }
write !,"Gathered SQL statistics for ",n," FHIR schemas",!
halt
EOF
then
  tail -20 "$log"
  exit 1
fi
grep "Gathered SQL statistics" "$log"
