"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from 'next/navigation'
import { BenchmarkReport } from "@/types/benchmark.types";
import { parseBenchmarkReport } from "@/lib/benchmark-parser";
import { Suite } from "@/components/Suite";
import { ReportSummary } from "@/components/ReportSummary";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

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
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link 
                href={branch !== 'main' ? `/?branch=${branch}` : '/'} 
                className="text-blue-500"
              >
                ← Back to all reports
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">
                Performance Benchmark Report
              </h1>
              {branch !== 'main' && (
                <p className="text-sm text-gray-600 mt-1">
                  Branch: <span className="font-medium">{branch}</span>
                </p>
              )}
            </div>
            {report && (
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>Run ID:</span>
                <span className="font-medium">{report.runid}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
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
                  style={{ height: 800, border: 0 }}
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
