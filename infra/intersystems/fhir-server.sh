#!/bin/bash
# Post-start hook (iris-main -a, see docker-compose.yaml): installs the FHIR R4
# server the same way https://github.com/intersystems-community/iris-fhir-template
# does (fhirtemplate.Setup:SetupFHIRServer — FHIRSERVER foundation namespace,
# JsonAdvSql storage, endpoint /fhir/r4), minus the demo data and UI.
#
# The template installs at image build time; that can't work here: the Community
# Edition license aborts startup when IRIS sees more than 20 cores, and
# `docker build` can't be CPU-limited, while the running container is
# (deploy.resources.limits.cpus in docker-compose.yaml).
#
# Benchmark-specific settings on top of the template:
#   - DebugMode 0: the template's DebugMode is a dev setting (tracebacks in
#     OperationOutcome; bit 2 would even create a new service per request).
#   - MaxSearchResults raised from 1000 to 10M (effectively unlimited for this
#     dataset, like FHIRServer__Bundle__EntryLimit on microsoft): by default every
#     search matching more than 1000 resources fails with 413 SearchTooCostly,
#     even with _count=20 — about 30% of the search suite.
#   - A `fhir` user for HTTP Basic auth. Unlike the other servers, auth can't be
#     switched off: the IRIS for Health FHIR endpoint serves only `metadata` to
#     unauthenticated requests (HS.FHIRServer.RestHandler:processRequest).
#   - The FHIR metadata tree is loaded before InstallInstance and the install
#     waits until no other process is (re)loading it: the endpoint install
#     iterates that tree to generate the search schema, and a concurrent load
#     (kill + re-merge by another process) makes it skip a run of resource
#     types. After the install the schema is verified against the metadata and
#     repaired the way UpdateService does, including the SQL privileges of the
#     %HS_DB_FHIRSERVER role on the generated tables — without those, requests
#     touching a table fail with "ResourceTypeUnknown" while single creates
#     (object access, no SQL privilege check) still work.
#   - /tmp/fhir-ready is created only when everything is done: the compose
#     healthcheck waits for it, so no request reaches the endpoint while the
#     install is still generating the search schema (see docker-compose.yaml).
#   - Web Gateway response/queue timeouts raised from 60s to 900s (the k6 import
#     request ceiling), so the gateway doesn't cut off a slow transaction bundle
#     (with the default 60s the biggest Synthea bundles fail with 504).
#     Request concurrency is capped in httpd-local.conf.
#
# InstallInstance occasionally runs before HealthShare's background startup has
# loaded the FHIR metadata ("Functional List Subject Resource Type 'Patient' ...
# is not a valid resource type"); the install is idempotent, so retry a few times.
set -e

install() {
# The Web Gateway registers itself with IRIS on its first request; until then the
# gateway settings below have nothing to apply to. Prime it with a request that
# does not touch the FHIR endpoint (the endpoint must not be hit mid-install).
wget -q -T 30 -O /dev/null http://localhost:52773/api/monitor/metrics || true
iris session "$ISC_PACKAGE_INSTANCENAME" -U HSLIB <<'EOF'
set appKey = "/fhir/r4", ns = "FHIRSERVER"
set strategyClass = "HS.FHIRServer.Storage.JsonAdvSQL.InteractionsStrategy"
try { do ##class(HS.Util.Installer.Foundation).Install(ns) } catch ex { do $system.OBJ.DisplayError(ex.AsStatus()) do ##class(%SYSTEM.Process).Terminate(, 1) }
zn ns
try { do ##class(HS.FHIRServer.Installer).InstallNamespace() } catch ex { do $system.OBJ.DisplayError(ex.AsStatus()) do ##class(%SYSTEM.Process).Terminate(, 1) }
set api = ##class(HS.FHIRMeta.API).getInstance($lb("hl7.fhir.r4.core@4.0.1")) write !, "FHIR metadata loaded: ", $select($isobject(api): "ok", 1: "FAILED"), !
for i = 1:1:90 { zn "%SYS" set busy = "" set q = ##class(%SQL.Statement).%ExecDirect(, "SELECT Pid, CurrentLineAndRoutine FROM %SYS.ProcessQuery WHERE Pid <> ? AND CurrentLineAndRoutine [ 'HS.FHIRMeta'", $job) while q.%Next() { set busy = busy _ q.%Get("Pid") _ ":" _ q.%Get("CurrentLineAndRoutine") _ " " } zn ns quit:busy=""  write "waiting for another process loading FHIR metadata: ", busy, ! hang 2 }
try { if '##class(HS.FHIRServer.ServiceAdmin).EndpointExists(appKey) { do ##class(HS.FHIRServer.Installer).InstallInstance(appKey, strategyClass, $lb("hl7.fhir.r4.core@4.0.1")) } } catch ex { do $system.OBJ.DisplayError(ex.AsStatus()) do ##class(%SYSTEM.Process).Terminate(, 1) }
if '##class(HS.FHIRServer.ServiceAdmin).EndpointExists(appKey) { write !,"FHIR endpoint ",appKey," was not created",! do ##class(%SYSTEM.Process).Terminate(, 1) }
set strategy = ##class(HS.FHIRServer.API.InteractionsStrategy).GetStrategyForEndpoint(appKey)
set config = strategy.GetServiceConfigData()
set config.DebugMode = 0
set config.MaxSearchResults = 10000000
do strategy.SaveServiceConfigData(config)
zn "%SYS"
if '##class(Security.Users).Exists("fhir") { set sc = ##class(Security.Users).Create("fhir", "%HS_DB_FHIRSERVER", "fhir") if 'sc { do $system.OBJ.DisplayError(sc) do ##class(%SYSTEM.Process).Terminate(, 1) } }
set user("ChangePassword") = 0, user("PasswordNeverExpires") = 1
set sc = ##class(Security.Users).Modify("fhir", .user) if 'sc { do $system.OBJ.DisplayError(sc) do ##class(%SYSTEM.Process).Terminate(, 1) }
set gateway = $system.CSP.GetGatewayRegistry().GetGatewayMgrs().GetAt(1)
if '$isobject(gateway) { write !,"Web Gateway is not registered (no request has passed through it yet)",! do ##class(%SYSTEM.Process).Terminate(, 1) }
set sc = gateway.GetDefaultParams(.params) if 'sc { do $system.OBJ.DisplayError(sc) do ##class(%SYSTEM.Process).Terminate(, 1) }
set params("Server_Response_Timeout") = 900, params("Queued_Request_Timeout") = 900
set sc = gateway.SetDefaultParams(.params) if 'sc { do $system.OBJ.DisplayError(sc) do ##class(%SYSTEM.Process).Terminate(, 1) }
write !,"FHIR server installed at ",appKey,!
halt
EOF
}

# The install generates the search-index schema by iterating the metadata
# search-parameter tree; a concurrent HS.FHIRMeta.API.getInstance() for the
# same packages (Load = kill + re-merge of that tree) makes the iteration skip a
# random run of resource types, which are then left with no search columns and
# every search on them silently returns everything. Verify against the metadata
# and, if anything is missing, repeat what UpdateService does: GenerateFromMeta
# is idempotent, GenSearchTablesFromSchema adds the missing columns.
verify_search_schema() {
iris session "$ISC_PACKAGE_INSTANCENAME" -U FHIRSERVER <<'EOF'
set appKey = "/fhir/r4", id = ##class(HS.FHIRServer.ServiceAdmin).GetInstanceIdForEndpoint(appKey), svc = ##class(HS.FHIRServer.ServiceInstance).GetById(id), api = ##class(HS.FHIRMeta.API).getInstance(svc.packageList)
for pass = 1:1:3 { set types = 0, missing = "", t = "" for { set t = api.NextSearchParamResourceType(t) quit:t=""  set types = types + 1, p = "", params = 0 for { set p = api.NextSearchParamForResourceType(t, p) quit:p=""  if (p.type '= "composite") && (p.code '= "_in") set params = params + 1 } if params > 0 { set c = ##class(%SQL.Statement).%ExecDirect(, "SELECT COUNT(*) AS N FROM HS_FHIRServer_Storage_Json.SearchColumn WHERE ServiceKey = ? AND ResourceType = ?", id, t) do c.%Next() if c.%Get("N") = 0 set missing = missing _ t _ " " } } write !, "search schema check ", pass, ": ", types, " resource types, missing search columns: ", $select(missing = "": "none", 1: missing), ! quit:missing=""  write "repairing the search schema", ! hang 5 do ##class(HS.FHIRServer.Storage.Json.SearchColumn).GenerateFromMeta(api, svc.parentRepo.%Id(), id) set strategy = ##class(HS.FHIRServer.API.InteractionsStrategy).GetStrategyForEndpoint(appKey), builder = ##class(HS.FHIRServer.Storage.JsonAdvSQL.SearchTableBuilder).%New(strategy) do builder.GenSearchTablesFromSchema(, 0, 0, 1) do ##class(HS.HC.Util.Installer).SetupPermissions($namespace, "") }
if (missing '= "") || (types < 100) { write "search schema still incomplete (", types, " types, missing: ", missing, ")", ! do ##class(%SYSTEM.Process).Terminate(, 1) }
set role = "%HS_DB_" _ $namespace, pkg = svc.searchClassesPackage _ "."
for pass = 1:1:2 { set tables = 0, broken = 0, noaccess = 0, sample = "" set q = ##class(%SQL.Statement).%ExecDirect(, "SELECT SqlSchemaName, SqlTableName FROM %Dictionary.CompiledClass WHERE Name %STARTSWITH ? AND ClassType = 'persistent'", pkg) while q.%Next() { set tables = tables + 1, tbl = q.%Get("SqlSchemaName") _ "." _ q.%Get("SqlTableName") if '$SYSTEM.SQL.Schema.TableExists(tbl) { set broken = broken + 1 set:sample="" sample = tbl } elseif ('$SYSTEM.SQL.Security.CheckPrivilege(role, 1, tbl, "s")) || ('$SYSTEM.SQL.Security.CheckPrivilege(role, 1, tbl, "i")) { set noaccess = noaccess + 1 set:sample="" sample = tbl } } write "search tables check ", pass, ": ", tables, " tables, not projected: ", broken, ", without privileges for ", role, ": ", noaccess, $select(sample = "": "", 1: " (e.g. " _ sample _ ")"), ! quit:(broken = 0) && (noaccess = 0)  write "granting privileges on the search tables", ! do ##class(HS.HC.Util.Installer).SetupPermissions($namespace, "") }
if (broken > 0) || (noaccess > 0) || (tables < 1000) { write "search tables still broken", ! do ##class(%SYSTEM.Process).Terminate(, 1) }
halt
EOF
}

for attempt in 1 2 3 4 5; do
  if install && verify_search_schema; then touch /tmp/fhir-ready; exit 0; fi
  echo "FHIR server install attempt $attempt failed; retrying in 20s"
  sleep 20
done
echo "FHIR server install failed after 5 attempts"
exit 1
