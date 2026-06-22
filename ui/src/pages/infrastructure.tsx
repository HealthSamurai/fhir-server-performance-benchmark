import React from "react";
import Link from "next/link";
import type { GetStaticProps } from "next";
import { InfraDiagram } from "@/components/InfraDiagram";
import { Header } from "@/components/Header";
import { loadInfraSnippets, type NodeInfo } from "@/lib/infra-snippets";

interface InfrastructureProps {
  snippets: Record<string, NodeInfo>;
}

export const getStaticProps: GetStaticProps<InfrastructureProps> = async () => {
  return { props: { snippets: loadInfraSnippets() } };
};

export default function Infrastructure({ snippets }: InfrastructureProps) {
  return (
    <div>
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div>
          <Link href="/" className="text-blue-600 hover:underline text-sm">
            ← Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Infrastructure</h1>
          <p className="text-sm text-gray-600 mt-1">
            How the benchmark suite is wired together
          </p>
        </div>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Overview</h2>
          <p className="text-gray-700 leading-relaxed">
            The benchmark compares three FHIR server implementations under identical workload, hardware, and database
            conditions. Each test run boots the full stack via Docker Compose, runs k6 scenarios sequentially against
            each server, and ships metrics to Prometheus.
          </p>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">FHIR servers under test</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="font-semibold text-gray-900">Aidbox</h3>
              <p className="text-sm text-gray-600 mt-1">healthsamurai/aidboxone:edge</p>
              <p className="text-sm text-gray-700 mt-2">JVM, basic auth, 8 vCPU / 20 GB RAM</p>
            </div>
            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="font-semibold text-gray-900">HAPI FHIR</h3>
              <p className="text-sm text-gray-600 mt-1">hapiproject/hapi:latest</p>
              <p className="text-sm text-gray-700 mt-2">JVM, basic auth, 8 vCPU / 20 GB RAM</p>
            </div>
            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="font-semibold text-gray-900">Medplum</h3>
              <p className="text-sm text-gray-600 mt-1">medplum/medplum-server</p>
              <p className="text-sm text-gray-700 mt-2">Node.js, OAuth2, 8 replicas × 2 vCPU / 3 GB</p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Architecture diagram</h2>
          <InfraDiagram snippets={snippets} />
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Monitoring stack</h2>
          <ul className="space-y-2 text-gray-700">
            <li>
              <span className="font-medium">Prometheus</span> — receives k6 metrics via remote-write and scrapes
              exporters.
            </li>
            <li>
              <span className="font-medium">Grafana</span> — provisioned dashboards with anonymous Admin access.
            </li>
            <li>
              <span className="font-medium">cAdvisor</span> — per-container CPU / memory / IO metrics.
            </li>
            <li>
              <span className="font-medium">postgres-exporter</span> — PostgreSQL internals.
            </li>
            <li>
              <span className="font-medium">OTel Collector</span> — receives OpenTelemetry metrics from Medplum
              (which has no native Prometheus endpoint) and re-exposes them via a Prometheus exporter that
              Prometheus scrapes.
            </li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">CI execution</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Drone CI runs the full suite on every commit on a dedicated bare-metal node .
            Docker-in-Docker hosts the stack; persistent host volumes cache image layers between builds.
            Search-test datasets are stored on ZFS for fast snapshot-based resets.
          </p>
          <p className="text-gray-700 leading-relaxed">
            Each run is tagged with <code className="px-1 py-0.5 bg-gray-100 rounded text-sm">runid</code>,
            <code className="px-1 py-0.5 bg-gray-100 rounded text-sm">commit</code>, and
            <code className="px-1 py-0.5 bg-gray-100 rounded text-sm">branch</code> labels, then snapshotted into a
            JSON report and uploaded to <code className="px-1 py-0.5 bg-gray-100 rounded text-sm">gs://samurai-public/fhir-server-performance-benchmark/</code>.
            The dashboard reads those snapshots directly from GCS.
          </p>
        </section>

      </main>
    </div>
  );
}
