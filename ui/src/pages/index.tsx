"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Server, Activity, ArrowRight } from "lucide-react";
import { BranchSelector } from "@/components/BranchSelector";
import { Header } from "@/components/Header";

const PAGE_SIZE = 10;

const SERVERS: { key: "aidbox" | "medplum" | "hapi" | "microsoft" | "wso2"; label: string }[] = [
  { key: "aidbox", label: "Aidbox" },
  { key: "medplum", label: "Medplum" },
  { key: "hapi", label: "HAPI" },
  { key: "microsoft", label: "MS FHIR" },
  { key: "wso2", label: "WSO2" },
];

interface SuiteRow {
  label: string;
  unit: string; // "ms" | "rps" | ...
  lowerBetter: boolean;
  values: { aidbox: number; medplum: number; hapi: number; microsoft: number; wso2: number };
}

interface RunSummaryData {
  rows: SuiteRow[];
}

type SummaryState = RunSummaryData | "loading" | "error";

// Trim noise from suite names so they fit a compact column ("FHIR Search" -> "Search").
function shortSuiteLabel(name: string): string {
  return String(name || "").replace(/^FHIR\s+/i, "").trim();
}

// RPS spans whole-number throughput (thousands) and fractional import rates,
// so keep one decimal for small values and group thousands for large ones.
function formatRps(v: number): string {
  return v < 10 && !Number.isInteger(v)
    ? v.toFixed(2)
    : Math.round(v).toLocaleString();
}

function computeSummary(report: any): RunSummaryData {
  const servers: ("aidbox" | "medplum" | "hapi" | "microsoft" | "wso2")[] = ["aidbox", "medplum", "hapi", "microsoft", "wso2"];

  // Each suite carries the real measured throughput in result.data (the "Total"
  // RPS per server) — no need to derive anything from latency.
  const rows: SuiteRow[] = (report?.suites || []).map((suite: any) => {
    // Import is throughput of imported *resources*, not HTTP requests: result.data
    // holds requests/sec (~3.5), while the test case holds resources/sec (~2779).
    const isImport = String(suite?.name || "").toLowerCase().includes("import");

    const total = isImport
      ? (suite?.test_cases?.[0]?.data?.[0] || {})
      : ((suite?.result?.data || []).find((d: any) => d.category === "Total")
          || suite?.result?.data?.[0]
          || {});

    return {
      label: shortSuiteLabel(suite?.name),
      unit: isImport ? "res/s" : "rps",
      lowerBetter: false,
      values: {
        aidbox: total.aidbox || 0,
        medplum: total.medplum || 0,
        hapi: total.hapi || 0,
        microsoft: total.microsoft || 0,
        wso2: total.wso2 || 0,
      },
    };
  });

  return { rows };
}

export default function Home() {
  const [branch, setBranch] = useState<string>("main");
  const [availableBranches, setAvailableBranches] = useState<string[]>(["main"]);
  const [runs, setRuns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});

  // Read ?branch= once on mount and fetch with that exact value. Doing this
  // in a single pass avoids a double-render race where the initial main fetch
  // could resolve after the branch fetch and overwrite the list.
  useEffect(() => {
    const b = typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("branch") || "main")
      : "main";
    setBranch(b);
    fetchReportsFromGCS(b);
    fetchAvailableBranches();
  }, []);

  const fetchAvailableBranches = async () => {
    try {
      const bucketUrl = 'https://storage.googleapis.com/storage/v1/b/samurai-public/o';
      const params = new URLSearchParams({
        prefix: 'fhir-server-performance-benchmark/',
        delimiter: '/',
        fields: 'prefixes',
      });
      const res = await fetch(`${bucketUrl}?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const branches: string[] = (data.prefixes || [])
        .map((p: string) => p.match(/fhir-server-performance-benchmark\/([^\/]+)\/$/))
        .filter((m: RegExpMatchArray | null) => m)
        .map((m: RegExpMatchArray) => m[1]);
      setAvailableBranches(['main', ...branches.filter((b) => b !== 'main')]);
    } catch (err) {
      console.error('Error fetching branches:', err);
    }
  };

  const handleBranchChange = (next: string) => {
    setBranch(next);
    setPage(1);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (next === 'main') url.searchParams.delete('branch');
      else url.searchParams.set('branch', next);
      window.history.replaceState({}, '', url.toString());
    }
    fetchReportsFromGCS(next);
  };

  const fetchReportsFromGCS = async (branchName: string = branch) => {
    try {
      setLoading(true);
      setError(null);
      setSummaries({});

      // GCS public bucket URL for listing objects
      const bucketUrl = 'https://storage.googleapis.com/storage/v1/b/samurai-public/o';
      const prefix = branchName === 'main'
        ? 'fhir-server-performance-benchmark/SNAPSHOT_'
        : `fhir-server-performance-benchmark/${branchName}/SNAPSHOT_`;

      const params = new URLSearchParams({
        prefix: prefix,
        // GCS lists objects in ascending name order with no reverse option, so we
        // must fetch the whole set and sort client-side. maxResults is GCS's
        // page cap (1000); at 300 the request truncated to the *oldest* 300 and
        // the newest reports never arrived. 1000 covers the current ~300 runs
        // with headroom — if runs ever exceed 1000, follow nextPageToken here.
        maxResults: '1000',
        fields: 'items(name,timeCreated)',
      });

      const apiUrl = `${bucketUrl}?${params}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch reports: ${response.status}`);
      }

      const data = await response.json();

      if (data.items && Array.isArray(data.items)) {
        const reportRuns = data.items
          .map((item: any) => {
            const match = item.name.match(/SNAPSHOT_(.+)\.json$/);
            return match ? {
              runId: match[1],
              timeCreated: item.timeCreated
            } : null;
          })
          .filter((item: any) => item !== null)
          // Sort newest-first (most recent run at the top). The runId is the
          // run's ISO-8601 start timestamp, so a plain code-point string compare
          // is exactly reverse-chronological and locale-independent — unlike GCS
          // timeCreated, which ties/misorders when files are bulk-uploaded rather
          // than written in run order.
          .sort((a: any, b: any) => (a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0))
          // Keep only the 100 most recent runs.
          .slice(0, 100)
          .map((item: any) => item.runId);

        setRuns(reportRuns);
      } else {
        setRuns([]);
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch reports');
      setRuns([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async (runId: string, branchName: string) => {
    setSummaries((prev) => ({ ...prev, [runId]: "loading" }));
    try {
      const basePath = branchName === "main"
        ? "fhir-server-performance-benchmark"
        : `fhir-server-performance-benchmark/${branchName}`;
      const url = `https://storage.googleapis.com/samurai-public/${basePath}/SNAPSHOT_${runId}.json`;
      const res = await fetch(url);
      if (!res.ok) {
        // Report file may not exist (e.g. listing/object mismatch) — treat as a
        // missing summary rather than throwing, which would trip the dev overlay.
        console.warn(`No summary for ${runId}: status ${res.status}`);
        setSummaries((prev) => ({ ...prev, [runId]: "error" }));
        return;
      }
      const data = await res.json();
      setSummaries((prev) => ({ ...prev, [runId]: computeSummary(data) }));
    } catch (err) {
      console.warn(`Error fetching summary for ${runId}:`, err);
      setSummaries((prev) => ({ ...prev, [runId]: "error" }));
    }
  };

  // Lazily fetch a per-run summary for the runs visible on the current page.
  // Depends on the page bounds (not the freshly-sliced array) so it only
  // re-runs when the list, page, or branch actually changes.
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(runs.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    runs.slice(start, start + PAGE_SIZE).forEach((run) => {
      if (summaries[run] === undefined) fetchSummary(run, branch);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, page, branch]);

  const formatRunId = (runId: string) => {
    try {
      if (runId.match(/^\d{4}-\d{2}-\d{2}T/)) {
        const date = new Date(runId);
        return date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        });
      }
    } catch {
      // If parsing fails, return original
    }
    return runId;
  };
  return (
    <div>
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p>Loading reports from cloud storage...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            <p className="font-medium">Error loading reports</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => fetchReportsFromGCS()}
              className="mt-2 text-sm underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && runs.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No benchmark reports available</p>
            <p className="text-sm mt-2">Reports will appear here once benchmark tests are run</p>
          </div>
        )}

            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Performance Benchmark Dashboard
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Comparing performance metrics across FHIR servers — Aidbox, Medplum, HAPI, Microsoft FHIR, and WSO2 FHIR
              </p>
            </div>

            <section className="mt-6 grid gap-4 md:grid-cols-2">
              <Link
                href="/infrastructure"
                className="group flex items-start gap-4 p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                  <Server className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-base font-semibold text-gray-900">Infrastructure</h3>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    How the benchmark is wired — servers, databases, the load generator, and their configs.
                  </p>
                </div>
              </Link>

              <Link
                href="/tests"
                className="group flex items-start gap-4 p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-green-50 text-green-600 shrink-0">
                  <Activity className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-base font-semibold text-gray-900">Tests</h3>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-green-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    What we measure and how — the k6 scenarios run against each FHIR server.
                  </p>
                </div>
              </Link>
            </section>

        {!loading && !error && runs.length > 0 && (() => {
          const totalPages = Math.max(1, Math.ceil(runs.length / PAGE_SIZE));
          const safePage = Math.min(page, totalPages);
          const start = (safePage - 1) * PAGE_SIZE;
          const visible = runs.slice(start, start + PAGE_SIZE);
          return (
            <>
              <div className="mb-6 mt-10 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  Benchmark reports
                  {branch !== 'main' && (
                    <span className="ml-2 px-2 py-0.5 rounded text-xs font-mono bg-yellow-100 text-yellow-800">
                      branch: {branch}
                    </span>
                  )}
                </h2>
                <BranchSelector
                  selectedBranch={branch}
                  onBranchChange={handleBranchChange}
                  availableBranches={availableBranches}
                />
              </div>

              <div className="flex flex-col gap-3">
                {visible.map((run) => (
                  <Link
                    key={run}
                    href={branch === 'main' ? `/report?runid=${run}` : `/report?runid=${run}&branch=${branch}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-baseline gap-3 min-w-0">
                      <p className="font-medium text-gray-900 text-sm whitespace-nowrap">
                        {formatRunId(run)}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        Run ID: {run}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <RunSummary summary={summaries[run]} />
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>

                <p className="text-right mt-8 text-sm text-gray-600">
                  Showing {start + 1}–{start + visible.length} of {runs.length}
                </p>

              {totalPages > 1 && (
                <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
              )}
            </>
          );
        })()}
      </main>
    </div>
  );
}

function RunSummary({ summary }: { summary: SummaryState | undefined }) {
  if (summary === undefined || summary === "loading") {
    return <div className="hidden md:block h-16 w-96 rounded bg-gray-50 animate-pulse" />;
  }

  if (summary === "error" || summary.rows.length === 0) {
    return <span className="hidden md:inline text-xs text-gray-400">no data</span>;
  }

  return (
    <table className="hidden md:table table-fixed text-xs tabular-nums border-collapse">
      <thead>
        <tr className="text-gray-400">
          <th className="font-normal text-left pr-3 pb-1 w-24" />
          {SERVERS.map((s) => (
            <th key={s.key} className="font-medium text-right px-2 pb-1 w-20">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {summary.rows.map((row) => {
          const vals = SERVERS.map((s) => row.values[s.key]);
          const positive = vals.filter((v) => v > 0);
          const best = positive.length
            ? row.lowerBetter
              ? Math.min(...positive)
              : Math.max(...positive)
            : null;
          return (
            <tr key={row.label}>
              <td className="text-left text-gray-500 pr-3 py-0.5 w-24 whitespace-nowrap">
                {row.label} <span className="text-gray-300">{row.unit}</span>
              </td>
              {SERVERS.map((s) => {
                const v = row.values[s.key];
                const isBest = best !== null && v === best && v > 0;
                return (
                  <td
                    key={s.key}
                    className={`text-right px-2 py-0.5 w-20 ${
                      isBest ? "font-semibold text-green-600" : "text-gray-700"
                    }`}
                  >
                    {v > 0 ? formatRps(v) : "—"}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}) {
  const pageNumbers = buildPageList(page, totalPages);

  return (
    <nav className="flex items-center justify-center gap-1 mt-8" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="inline-flex items-center justify-center w-9 h-9 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        aria-label="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {pageNumbers.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-2 text-gray-400 select-none">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`min-w-9 h-9 px-3 rounded text-sm border transition cursor-pointer ${
              p === page
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="inline-flex items-center justify-center w-9 h-9 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        aria-label="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}

function buildPageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const result: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) result.push("…");
  for (let i = left; i <= right; i++) result.push(i);
  if (right < total - 1) result.push("…");
  result.push(total);
  return result;
}
