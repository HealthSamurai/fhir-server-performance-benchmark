import fs from "fs";
import path from "path";

const repoRoot = path.resolve(process.cwd(), "..");

function readSafe(rel: string): string {
  try {
    return fs.readFileSync(path.join(repoRoot, rel), "utf-8");
  } catch {
    return "";
  }
}

type ComposeBlock = { content: string; line: number };

function extractComposeService(name: string): ComposeBlock {
  const compose = readSafe("docker-compose.yaml");
  if (!compose) return { content: "", line: 1 };
  const lines = compose.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^  ${name}:\\s*$`).test(l));
  if (start < 0) return { content: "", line: 1 };
  let end = start + 1;
  for (; end < lines.length; end++) {
    const l = lines[end];
    if (/^  [A-Za-z]/.test(l) && !/^   /.test(l)) break;
    if (/^[A-Za-z]/.test(l)) break;
  }
  return { content: lines.slice(start, end).join("\n").trimEnd(), line: start + 1 };
}

export type TestScenario = {
  name: string;
  file: string;
  description: string;
  content: string;
};

export function loadTestScenarios(): TestScenario[] {
  const items: Omit<TestScenario, "content">[] = [
    {
      name: "prewarm.js",
      file: "k6/prewarm.js",
      description: "Warm up JVMs and caches before measurement",
    },
    {
      name: "crud.js",
      file: "k6/crud.js",
      description: "Create / read / update / delete throughput on FHIR resources",
    },
    {
      name: "search.js",
      file: "k6/search.js",
      description: "Search performance on a pre-loaded Patient dataset with custom indexes",
    },
    {
      name: "import.js",
      file: "k6/import.js",
      description: "Bulk ingest of a Synthea bundle",
    },
  ];
  return items.map((it) => ({
    ...it,
    content: readSafe(it.file).trimEnd(),
  }));
}

export type Snippet = {
  /** Display label shown in the modal header */
  label: string;
  /** Repo-relative file path used to build the GitHub link */
  file: string;
  /** Optional starting line for #L anchor */
  line?: number;
  content: string;
  language: string;
};

export type NodeInfo = {
  id: string;
  title: string;
  description: string;
  snippets: Snippet[];
};

function trimBigConfig(content: string, maxLines = 200): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;
  return lines.slice(0, maxLines).join("\n") + `\n# … truncated (${lines.length - maxLines} more lines)`;
}

function stripComments(content: string, language: string): string {
  if (!content || language === "json") return content;
  return content
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compose(name: string): Snippet {
  const block = extractComposeService(name);
  return {
    label: `docker-compose.yaml — ${name} service`,
    file: "docker-compose.yaml",
    line: block.line,
    content: stripComments(block.content, "yaml"),
    language: "yaml",
  };
}

function fileSnippet(file: string, language: string, label?: string, maxLines?: number): Snippet {
  const raw = readSafe(file);
  const clean = stripComments(raw, language);
  return {
    label: label ?? file,
    file,
    content: maxLines ? trimBigConfig(clean, maxLines) : clean,
    language,
  };
}

export function loadInfraSnippets(): Record<string, NodeInfo> {
  return {
    k6: {
      id: "k6",
      title: "k6 runner",
      description:
        "Grafana k6 runs scenarios against each FHIR server inside the docker-compose network. Results are sent to Prometheus via remote-write.",
      snippets: [
        compose("k6"),
        fileSnippet("runner.sh", "bash", undefined, 80),
      ],
    },
    tgz: {
      id: "tgz",
      title: "tgz",
      description: "HTTP server that downloads and serves the Synthea bundle for the import benchmark.",
      snippets: [
        compose("tgz"),
        fileSnippet("infra/tgz/Dockerfile", "docker"),
      ],
    },
    aidbox: {
      id: "aidbox",
      title: "Aidbox",
      description: "JVM-based FHIR server from Health Samurai. Native Prometheus endpoint on :8379.",
      snippets: [
        compose("aidbox"),
        fileSnippet("infra/aidbox/initbundle.json", "json"),
      ],
    },
    hapi: {
      id: "hapi",
      title: "HAPI FHIR",
      description: "Reference Java FHIR server. Spring Boot Actuator exposes Prometheus metrics at /actuator/prometheus.",
      snippets: [
        compose("hapi"),
        fileSnippet("infra/hapi/application.yaml", "yaml", undefined, 200),
      ],
    },
    medplum: {
      id: "medplum",
      title: "Medplum",
      description:
        "Node.js-based FHIR server. No native Prometheus endpoint — emits OpenTelemetry metrics, which are forwarded through the OTel Collector.",
      snippets: [
        compose("medplum"),
        fileSnippet("infra/medplum/config.json", "json", undefined, 60),
      ],
    },
    microsoft: {
      id: "microsoft",
      title: "Microsoft FHIR Server",
      description:
        "The .NET (R4) FHIR server from Microsoft. Unlike the others it only supports SQL Server / Cosmos DB, so it runs against a dedicated SQL Server (mssql) rather than the shared PostgreSQL.",
      snippets: [compose("microsoft")],
    },
    wso2: {
      id: "wso2",
      title: "WSO2 FHIR Server",
      description:
        "Go-based FHIR server from WSO2, shipped as a single static binary. Runs against the shared PostgreSQL (wso2 database); health probed on /health/ready via a curl sidecar.",
      snippets: [compose("wso2")],
    },
    postgres: {
      id: "postgres",
      title: "PostgreSQL 18",
      description: "Single shared instance, separate databases per FHIR server. Tuned via postgres.conf.",
      snippets: [
        compose("postgres"),
        fileSnippet("infra/postgres/postgres.conf", "conf", undefined, 100),
      ],
    },
    mssql: {
      id: "mssql",
      title: "SQL Server 2022",
      description:
        "Dedicated datastore for the Microsoft FHIR server (Developer edition). Tuned for the benchmark load via tune.sql — MAXDOP, cost threshold, and one tempdb file per core — applied by a one-shot mssql-tune sidecar.",
      snippets: [
        compose("mssql"),
        fileSnippet("infra/mssql/tune.sql", "sql"),
      ],
    },
    redis: {
      id: "redis",
      title: "Redis",
      description: "Used by Medplum for sessions and BullMQ job queues.",
      snippets: [compose("redis")],
    },
    cadvisor: {
      id: "cadvisor",
      title: "cAdvisor",
      description: "Per-container CPU / memory / I/O metrics. Talks to dind's containerd via the explicitly mounted socket.",
      snippets: [compose("cadvisor")],
    },
    prometheus: {
      id: "prometheus",
      title: "Prometheus",
      description: "Scrapes /metrics endpoints from FHIR servers and exporters; receives k6 results via remote-write.",
      snippets: [
        compose("prometheus"),
        fileSnippet("infra/prometheus/config.yaml", "yaml"),
      ],
    },
    grafana: {
      id: "grafana",
      title: "Grafana",
      description: "Dashboards over Prometheus. Anonymous Admin access enabled in dev.",
      snippets: [compose("grafana")],
    },
    "postgres-exporter": {
      id: "postgres-exporter",
      title: "postgres-exporter",
      description: "Exposes PostgreSQL internals as Prometheus metrics on :9187.",
      snippets: [compose("postgres-exporter")],
    },
    "mssql-exporter": {
      id: "mssql-exporter",
      title: "mssql-exporter",
      description: "The SQL Server counterpart to postgres-exporter — exposes the Microsoft FHIR datastore's internals (DB size, transactions, page life expectancy, I/O stalls) as Prometheus metrics on :4000.",
      snippets: [compose("mssql-exporter")],
    },
    "otel-collector": {
      id: "otel-collector",
      title: "OTel Collector",
      description: "Receives OTLP from Medplum and re-exports as Prometheus metrics on :8889.",
      snippets: [
        compose("otel-collector"),
        fileSnippet("infra/otel/config.yaml", "yaml"),
      ],
    },
  };
}
