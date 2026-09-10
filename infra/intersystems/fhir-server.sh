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
#   - Web Gateway response/queue timeouts raised from 60s to 900s (the k6 import
#     request ceiling), so the gateway doesn't cut off a slow transaction bundle.
set -e

iris session "$ISC_PACKAGE_INSTANCENAME" -U HSLIB <<'EOF'
set appKey = "/fhir/r4", ns = "FHIRSERVER"
set strategyClass = "HS.FHIRServer.Storage.JsonAdvSQL.InteractionsStrategy"
try { do ##class(HS.Util.Installer.Foundation).Install(ns) } catch ex { do $system.OBJ.DisplayError(ex.AsStatus()) do ##class(%SYSTEM.Process).Terminate(, 1) }
zn ns
try { do ##class(HS.FHIRServer.Installer).InstallNamespace() } catch ex { do $system.OBJ.DisplayError(ex.AsStatus()) do ##class(%SYSTEM.Process).Terminate(, 1) }
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
set sc = gateway.GetDefaultParams(.params) if 'sc { do $system.OBJ.DisplayError(sc) do ##class(%SYSTEM.Process).Terminate(, 1) }
set params("Server_Response_Timeout") = 900, params("Queued_Request_Timeout") = 900
set sc = gateway.SetDefaultParams(.params) if 'sc { do $system.OBJ.DisplayError(sc) do ##class(%SYSTEM.Process).Terminate(, 1) }
write !,"FHIR server installed at ",appKey,!
halt
EOF
