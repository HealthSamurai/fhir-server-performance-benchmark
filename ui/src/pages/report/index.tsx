"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from 'next/navigation'
import { BenchmarkReport } from "@/types/benchmark.types";
import { parseBenchmarkReport } from "@/lib/benchmark-parser";
import { Suite } from "@/components/Suite";
import { ReportSummary } from "@/components/ReportSummary";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Download } from "lucide-react";
import { Header } from "@/components/Header";

export default function ReportPage() {
  const searchParams = useSearchParams();
  const runid = searchParams?.get('runid') || null;
  const branch = searchParams?.get('branch') || 'main';
  
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (runid) {
      fetchReportFromGCS(runid, branch);
    } else {
      setLoading(false);
      setError('No run ID provided');
    }
  }, [runid, branch]);

  const fetchReportFromGCS = async (runId: string, branchName: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // Direct URL to the report file in GCS public bucket
      // Adjust path based on branch
      const basePath = branchName === 'main' 
        ? 'fhir-server-performance-benchmark'
        : `fhir-server-performance-benchmark/${branchName}`;
      const reportUrl = `https://storage.googleapis.com/samurai-public/${basePath}/SNAPSHOT_${runId}.json`;
      
      const response = await fetch(reportUrl);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Report not found for run ID: ${runId}`);
        }
        throw new Error(`Failed to fetch report: ${response.status}`);
      }

      const reportData = await response.text();
      const parsedReport = parseBenchmarkReport(reportData);
      setReport(parsedReport);
    } catch (err) {
      console.error('Error fetching report:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch report');
      setReport(null);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <Header />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Link
          href={branch !== 'main' ? `/?branch=${branch}` : '/'}
          className="inline-block mb-6 text-blue-500 hover:underline"
        >
          ← Back to all reports
        </Link>

        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p>Loading report data...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            <p className="font-medium">Error loading report</p>
            <p className="text-sm mt-1">{error}</p>
            <div className="mt-4">
              <Link 
                href={branch !== 'main' ? `/?branch=${branch}` : '/'} 
                className="text-sm text-red-700 underline hover:no-underline"
              >
                Return to reports list
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && report && (
          <>
            <div className="mb-6 flex items-center justify-between gap-4">
              <h1 className="text-2xl font-bold text-gray-900">
                Performance Benchmark Report
              </h1>
              <a
                href={reportDownloadUrl(runid || report.runid, branch)}
                download={`SNAPSHOT_${runid || report.runid}.json`}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                title="Download report JSON"
              >
                <Download className="w-4 h-4" />
                <span>Download report</span>
              </a>
            </div>
            <dl className="mb-8 flex flex-wrap gap-x-10 gap-y-4 rounded-lg border border-gray-200 bg-white px-6 py-4">
              <MetaItem label="Run ID" value={runid || report.runid} mono />
              <MetaItem label="Branch" value={branch} />
              <MetaItem label="Run date" value={formatDateTime(runid || report.start_time)} />
              {report.duration > 0 && (
                <MetaItem label="Duration" value={formatDuration(report.duration)} />
              )}
            </dl>
            <ReportSummary report={report} />
            {report.grafanaSnapshot?.url && (
              <Card className="w-full mt-6 mb-12">
                <CardHeader className="border-b flex flex-row items-center justify-between">
                  <CardTitle>Grafana snapshot</CardTitle>
                  <a
                    href={report.grafanaSnapshot.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
                    title="Open Grafana snapshot (new tab)"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="https://cdn.simpleicons.org/grafana" alt="" className="w-4 h-4" />
                    <span>Open in Grafana</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </a>
                </CardHeader>
                <iframe
                  src={`${report.grafanaSnapshot.url}?kiosk&theme=light`}
                  className="w-full"
                  style={{ height: 950, border: 0 }}
                  title="Grafana snapshot"
                  loading="lazy"
                />
              </Card>
            )}
            {report.suites.map((suite) => (
              <div key={suite.name} className="mb-12">
                <Suite suite={suite} />
              </div>
            ))}
          </>
        )}

        {!loading && !error && !report && (
          <div className="text-center py-12">
            <p className="text-gray-500">No report data available</p>
            <Link href="/" className="mt-4 inline-block text-blue-500 underline">
              Back to reports list
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium text-gray-900 ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || !parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

function reportDownloadUrl(runId: string, branchName: string): string {
  const basePath = branchName === 'main'
    ? 'fhir-server-performance-benchmark'
    : `fhir-server-performance-benchmark/${branchName}`;
  return `https://storage.googleapis.com/samurai-public/${basePath}/SNAPSHOT_${runId}.json`;
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
