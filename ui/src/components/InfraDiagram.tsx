"use client";

import React, { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import type { NodeInfo } from "@/lib/infra-snippets";

const GITHUB_BASE =
  "https://github.com/HealthSamurai/fhir-server-performance-benchmark/blob/main";

const ASSET_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function NodeIcon({ node }: { node: DiagramNode }) {
  const url = node.iconUrl ?? (node.iconSlug ? `https://cdn.simpleicons.org/${node.iconSlug}` : null);
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="w-6 h-6 shrink-0 mt-0.5 rounded"
        loading="lazy"
      />
    );
  }
  if (node.iconLetter) {
    return (
      <div
        className="w-6 h-6 shrink-0 mt-0.5 rounded flex items-center justify-center text-white text-[12px] font-bold"
        style={{ backgroundColor: node.borderColor }}
        aria-hidden
      >
        {node.iconLetter}
      </div>
    );
  }
  return null;
}

type Side = "top" | "right" | "bottom" | "left";

interface DiagramNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle?: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  /** Full icon URL (overrides iconSlug) */
  iconUrl?: string;
  /** simpleicons.org slug, e.g. "postgresql" */
  iconSlug?: string;
  /** Fallback letter rendered in a colored bubble when no logo is available */
  iconLetter?: string;
}

interface DiagramEdge {
  from: string;
  to: string;
  fromSide?: Side;
  toSide?: Side;
  color: "blue" | "green" | "red" | "orange";
  dashed?: boolean;
  label?: string;
  curve?: number;
}

const COLOR_HEX: Record<DiagramEdge["color"], string> = {
  blue: "#2563eb",
  green: "#16a34a",
  red: "#dc2626",
  orange: "#ea580c",
};

const NODES: DiagramNode[] = [
  { id: "k6",                x: 40,  y: 90,  w: 220, h: 64, title: "k6 runner",         subtitle: "prewarm · crud · search · import", bgColor: "#dbeafe", borderColor: "#3b82f6", textColor: "#1e3a8a", iconSlug: "k6" },
  { id: "tgz",               x: 720, y: 90,  w: 220, h: 64, title: "tgz",               subtitle: "Synthea bundle host",              bgColor: "#fef3c7", borderColor: "#d97706", textColor: "#78350f", iconLetter: "T" },
  { id: "aidbox",            x: 40,  y: 200, w: 220, h: 78, title: "Aidbox",            subtitle: "JVM · :8080 · /metrics on :8379",  bgColor: "#fce7f3", borderColor: "#db2777", textColor: "#831843", iconUrl: `${ASSET_BASE}/images/aidbox.svg` },
  { id: "hapi",              x: 380, y: 200, w: 220, h: 78, title: "HAPI FHIR",         subtitle: "JVM · /actuator/prometheus",       bgColor: "#fce7f3", borderColor: "#db2777", textColor: "#831843", iconUrl: `${ASSET_BASE}/images/hapi.png` },
  { id: "medplum",           x: 720, y: 200, w: 220, h: 78, title: "Medplum (×8)",      subtitle: "Node.js · :8103 · OAuth2",         bgColor: "#fce7f3", borderColor: "#db2777", textColor: "#831843", iconUrl: `${ASSET_BASE}/images/medplum.svg` },
  { id: "microsoft",         x: 1060, y: 200, w: 220, h: 78, title: "Microsoft FHIR",    subtitle: ".NET R4 · :8080",                  bgColor: "#fce7f3", borderColor: "#db2777", textColor: "#831843", iconUrl: `${ASSET_BASE}/images/microsoft.svg` },
  { id: "wso2",              x: 1400, y: 200, w: 220, h: 78, title: "WSO2 FHIR",         subtitle: "Go · :9090",                       bgColor: "#fce7f3", borderColor: "#db2777", textColor: "#831843", iconUrl: `${ASSET_BASE}/images/wso2.svg` },
  { id: "postgres",          x: 280, y: 330, w: 280, h: 74, title: "PostgreSQL 18",     subtitle: "shared · DB-per-server",           bgColor: "#dcfce7", borderColor: "#16a34a", textColor: "#14532d", iconSlug: "postgresql" },
  { id: "redis",             x: 720, y: 330, w: 220, h: 74, title: "Redis",             subtitle: "Medplum sessions/cache",           bgColor: "#fee2e2", borderColor: "#dc2626", textColor: "#7f1d1d", iconSlug: "redis" },
  { id: "mssql",             x: 1060, y: 330, w: 220, h: 74, title: "SQL Server 2022",   subtitle: "dedicated · Microsoft only",       bgColor: "#dcfce7", borderColor: "#16a34a", textColor: "#14532d", iconUrl: `${ASSET_BASE}/images/mssql.svg` },
  { id: "cadvisor",          x: 40,  y: 500, w: 220, h: 64, title: "cAdvisor",          subtitle: "container CPU / mem / I/O",        bgColor: "#ffedd5", borderColor: "#f97316", textColor: "#7c2d12", iconSlug: "googlecloud" },
  { id: "prometheus",        x: 380, y: 500, w: 220, h: 64, title: "Prometheus",        subtitle: "scrape + remote-write",            bgColor: "#ffedd5", borderColor: "#f97316", textColor: "#7c2d12", iconSlug: "prometheus" },
  { id: "otel-collector",    x: 720, y: 500, w: 220, h: 64, title: "OTel Collector",    subtitle: "OTLP → Prometheus exporter",       bgColor: "#ffedd5", borderColor: "#f97316", textColor: "#7c2d12", iconSlug: "opentelemetry" },
  { id: "postgres-exporter", x: 40,  y: 600, w: 220, h: 64, title: "postgres-exporter", subtitle: "PG internals",                     bgColor: "#ffedd5", borderColor: "#f97316", textColor: "#7c2d12", iconSlug: "postgresql" },
  { id: "grafana",           x: 380, y: 600, w: 220, h: 64, title: "Grafana",           subtitle: "dashboards · :13000",              bgColor: "#ffedd5", borderColor: "#f97316", textColor: "#7c2d12", iconSlug: "grafana" },
  { id: "mssql-exporter",    x: 1060, y: 600, w: 220, h: 64, title: "mssql-exporter",   subtitle: "SQL Server internals",             bgColor: "#ffedd5", borderColor: "#f97316", textColor: "#7c2d12", iconUrl: `${ASSET_BASE}/images/mssql.svg` },
];

const EDGES: DiagramEdge[] = [
  { from: "k6", to: "aidbox",              color: "blue" },
  { from: "k6", to: "hapi",                color: "blue" },
  { from: "k6", to: "medplum",             color: "blue" },
  { from: "k6", to: "microsoft",           color: "blue" },
  { from: "k6", to: "wso2",                color: "blue" },
  { from: "k6", to: "tgz",                 color: "blue", dashed: true, label: "fetch dataset", fromSide: "right", toSide: "left" },
  { from: "aidbox",  to: "postgres",       color: "green" },
  { from: "hapi",    to: "postgres",       color: "green" },
  { from: "medplum", to: "postgres",       color: "green" },
  { from: "wso2",    to: "postgres",       color: "green" },
  { from: "microsoft", to: "mssql",        color: "green" },
  { from: "medplum", to: "redis",          color: "red" },
  { from: "aidbox", to: "prometheus",      color: "orange", dashed: true, curve: 0.4 },
  { from: "hapi",   to: "prometheus",      color: "orange", dashed: true },
  { from: "k6",     to: "prometheus",      color: "orange", dashed: true, curve: -0.5 },
  { from: "cadvisor", to: "prometheus",    color: "orange", fromSide: "right", toSide: "left" },
  { from: "postgres-exporter", to: "prometheus", color: "orange", curve: 0.3 },
  { from: "mssql-exporter", to: "mssql",         color: "green",  dashed: true, fromSide: "top", toSide: "bottom" },
  { from: "mssql-exporter", to: "prometheus",    color: "orange", curve: -0.3, fromSide: "left", toSide: "right" },
  { from: "prometheus", to: "grafana",     color: "orange" },
  { from: "medplum", to: "otel-collector", color: "orange", dashed: true },
  { from: "otel-collector", to: "prometheus", color: "orange", fromSide: "left", toSide: "right" },
];

function nodeAnchor(n: DiagramNode, side: Side): { x: number; y: number } {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  switch (side) {
    case "top":    return { x: cx, y: n.y };
    case "bottom": return { x: cx, y: n.y + n.h };
    case "left":   return { x: n.x, y: cy };
    case "right":  return { x: n.x + n.w, y: cy };
  }
}

function autoSides(from: DiagramNode, to: DiagramNode): { fromSide: Side; toSide: Side } {
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return { fromSide: dy > 0 ? "bottom" : "top", toSide: dy > 0 ? "top" : "bottom" };
  }
  return { fromSide: dx > 0 ? "right" : "left", toSide: dx > 0 ? "left" : "right" };
}

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, curve = 0): string {
  if (curve === 0) {
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const ctrl = { x: mx + nx * len * curve, y: my + ny * len * curve };
  return `M ${a.x} ${a.y} Q ${ctrl.x} ${ctrl.y} ${b.x} ${b.y}`;
}

const W = 1660;
const H = 720;

interface Props {
  snippets: Record<string, NodeInfo>;
}

export function InfraDiagram({ snippets }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / W));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      <div ref={containerRef} className="overflow-x-auto flex justify-center">
        <div
          className="relative"
          style={{
            width: W,
            height: H,
            flexShrink: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            marginBottom: -(H * (1 - scale)),
          }}
        >
          <svg
            className="absolute inset-0 pointer-events-none"
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
          >
            <defs>
              {(Object.entries(COLOR_HEX) as [DiagramEdge["color"], string][]).map(([name, hex]) => (
                <marker
                  key={name}
                  id={`arr-${name}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={hex} />
                </marker>
              ))}
            </defs>
            {/* Monitoring band — drawn first so arrows layer on top of it */}
            <rect
              x={20}
              y={470}
              width={1260}
              height={220}
              rx={10}
              ry={10}
              fill="#fff7ed"
              stroke="#ea580c"
              strokeDasharray="6,4"
            />
            <text x={40} y={490} fontSize={12} fontWeight={700} fill="#9a3412" letterSpacing={1}>
              MONITORING
            </text>
            {EDGES.map((e, i) => {
              const from = NODES.find((n) => n.id === e.from);
              const to = NODES.find((n) => n.id === e.to);
              if (!from || !to) return null;
              const sides =
                e.fromSide && e.toSide
                  ? { fromSide: e.fromSide, toSide: e.toSide }
                  : autoSides(from, to);
              const a = nodeAnchor(from, sides.fromSide);
              const b = nodeAnchor(to, sides.toSide);
              const d = edgePath(a, b, e.curve ?? 0);
              return (
                <g key={i}>
                  <path
                    d={d}
                    fill="none"
                    stroke={COLOR_HEX[e.color]}
                    strokeWidth={1.6}
                    strokeDasharray={e.dashed ? "4,3" : undefined}
                    markerEnd={`url(#arr-${e.color})`}
                  />
                  {e.label && (
                    <text
                      x={(a.x + b.x) / 2}
                      y={(a.y + b.y) / 2 - 6}
                      textAnchor="middle"
                      fontSize="10"
                      fill={COLOR_HEX[e.color]}
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {NODES.map((n) => {
            const hasSnippet = !!snippets[n.id];
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => hasSnippet && setActive(n.id)}
                disabled={!hasSnippet}
                className="absolute rounded-md px-3 py-2 text-left shadow-sm transition hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-default"
                style={{
                  left: n.x,
                  top: n.y,
                  width: n.w,
                  height: n.h,
                  backgroundColor: n.bgColor,
                  border: `2px solid ${n.borderColor}`,
                  color: n.textColor,
                  cursor: hasSnippet ? "pointer" : "default",
                }}
                title={hasSnippet ? "Click for config" : undefined}
              >
                <div className="flex items-start gap-2 h-full">
                  <NodeIcon node={n} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm leading-tight">{n.title}</div>
                    {n.subtitle && (
                      <div className="text-[11px] opacity-80 mt-0.5 leading-tight truncate">{n.subtitle}</div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-gray-600 mt-3 px-1">
        <LegendItem color={COLOR_HEX.blue} label="FHIR HTTP" />
        <LegendItem color={COLOR_HEX.green} label="SQL" />
        <LegendItem color={COLOR_HEX.red} label="Cache" />
        <LegendItem color={COLOR_HEX.orange} dashed label="Metrics scrape / remote-write" />
      </div>
      <p className="text-xs text-gray-500 mt-2 text-center">
        Click any block to view the actual <code className="px-1 bg-gray-100 rounded">docker-compose</code> snippet
        and config files for that service.
      </p>

      {active && snippets[active] && (
        <NodeModal node={snippets[active]} onClose={() => setActive(null)} />
      )}
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="24" height="6">
        <line
          x1="0"
          y1="3"
          x2="24"
          y2="3"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? "3,3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

function NodeModal({ node, onClose }: { node: NodeInfo; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{node.title}</h3>
            <p className="text-sm text-gray-600 mt-1">{node.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-3xl leading-none ml-4"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-5">
          {node.snippets
            .filter((s) => s.content && s.content.trim().length > 0)
            .map((s, i) => (
              <div key={i}>
                <a
                  href={`${GITHUB_BASE}/${s.file}${s.line ? `#L${s.line}` : ""}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-mono text-blue-600 hover:text-blue-700 hover:underline mb-2"
                  title="Open on GitHub (new tab)"
                >
                  {s.label}
                  <ExternalLink className="w-4 h-4" />
                </a>
                <CodeBlock code={s.content} language={s.language} />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
