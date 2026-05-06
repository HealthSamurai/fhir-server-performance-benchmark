#!/usr/bin/env node

import fs from 'fs'

const GRAFANA_URL = process.env.GRAFANA_URL
const TOKEN = process.env.GRAFANA_TOKEN
if (!TOKEN) {
  process.stderr.write('error: GRAFANA_TOKEN is required\n')
  process.exit(1)
}

const DASHBOARD_UID = 'fhir-server-performance'

async function http(method, urlPath, body) {
  const headers = { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' }
  const init = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(GRAFANA_URL + urlPath, init)
  const text = await res.text()
  if (!res.ok) {
    process.stderr.write(`HTTP ${res.status} on ${method} ${urlPath}: ${text.slice(0, 500)}\n`)
    throw new Error(`HTTP ${res.status}`)
  }
  return text ? JSON.parse(text) : null
}


function parseIso(s) {
  const d = new Date(s.trim())
  if (isNaN(d.getTime())) throw new Error(`bad timestamp: ${s}`)
  return d
}


// /api/ds/query does not interpolate template variables itself — the frontend
// always pre-substitutes them. We do the same here. $__all is replaced with
// `.+` so PromQL `=~"$var"` matches any non-empty value.
function interpolate(s, vars) {
  if (typeof s !== 'string' || !vars) return s
  let out = s
  for (const [name, raw] of Object.entries(vars)) {
    const val = raw === '$__all' ? '.+' : raw
    out = out.split('${' + name + '}').join(val).split('$' + name).join(val)
  }
  return out
}


// Convert a V2 PanelQuery into the flat V1 query payload /api/ds/query expects.
// Spread of inner.spec goes first so explicit refId/datasource/hide win.
function v2QueryToV1(panelQuery) {
  const pq = panelQuery.spec || {}
  const inner = pq.query || {}
  const ds = inner.datasource || {}
  return {
    ...(inner.spec || {}),
    refId: pq.refId,
    datasource: { uid: ds.name, type: inner.group },
    hide: pq.hidden || false,
  }
}


// Build a V2 PanelQuery wrapping pre-fetched frames as queryType='snapshot'.
function makeSnapshotPanelQuery(frames) {
  return {
    kind: 'PanelQuery',
    spec: {
      refId: 'A',
      hidden: false,
      query: {
        kind: 'DataQuery',
        group: 'grafana',
        datasource: { name: 'grafana' },
        spec: { queryType: 'snapshot', snapshot: frames },
      },
    },
  }
}


// Set V2 variable's `current` (multi-select uses arrays).
function setVarCurrent(varSpec, value) {
  const isAll = value === '$__all'
  const text = isAll ? 'All' : value
  const val = isAll ? '$__all' : value
  varSpec.current = varSpec.multi ? { text: [text], value: [val] } : { text, value: val }
}


// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
Usage: node scripts/grafana-snapshot.js <runid> [--from <iso>] [--to <iso>] [--report <path>]

If --from is omitted: from = runid.
If --to is omitted:   to = now (the moment the script runs).
With --report, the snapshot {key, url} is merged into the given JSON file as
.grafanaSnapshot — used by CI to enrich the benchmark report.

Examples:
  node scripts/grafana-snapshot.js 2026-04-29T00:23:42Z
  node scripts/grafana-snapshot.js 2026-04-29T00:23:42Z --from 2026-04-29T00:21:00Z --to 2026-04-29T01:11:00Z
  node scripts/grafana-snapshot.js 2026-04-29T00:23:42Z --report reports/SNAPSHOT_2026-04-29T00:23:42Z.json
`)
}


function parseArgs() {
  const args = process.argv.slice(2)
  const params = { runid: null, from: null, to: null, report: null }

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    switch (a) {
      case '--from': params.from = args[++i]; break
      case '--to': params.to = args[++i]; break
      case '--report': params.report = args[++i]; break
      case '-h':
      case '--help': printHelp(); process.exit(0)
      default:
        if (!params.runid) params.runid = a
        else { console.error(`Unknown arg: ${a}`); process.exit(1) }
    }
  }

  if (!params.runid) {
    console.error('error: runid is required')
    printHelp()
    process.exit(1)
  }
  return params
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { runid, from, to, report } = parseArgs()

  const started = parseIso(from || runid)
  const ended = to ? parseIso(to) : new Date()
  const tFrom = started.getTime()
  const tTo = ended.getTime()

  const pinnedVars = { runid }

  console.log(`runid    : ${runid}`)
  console.log(`window   : ${started.toISOString()} → ${ended.toISOString()}`)
  console.log(`grafana  : ${GRAFANA_URL}`)
  console.log(`dashboard: ${DASHBOARD_UID}`)

  // Fetch V2 dashboard spec (Scenes format)
  const v2 = await http('GET', `/apis/dashboard.grafana.app/v2/namespaces/default/dashboards/${DASHBOARD_UID}`)
  const spec = v2.spec
  const variables = spec.variables || []

  // Default any unpinned includeAll var to $__all, write the pinned value back
  // to variable.current and hide all variables — the snapshot has frozen
  // values, so the dropdowns add no value and only clutter the view.
  for (const v of variables) {
    const vs = v.spec || {}
    const name = vs.name
    if (!name) continue
    if (pinnedVars[name] === undefined && vs.includeAll) pinnedVars[name] = '$__all'
    if (pinnedVars[name] !== undefined) setVarCurrent(vs, pinnedVars[name])
    vs.hide = 'hideVariable'
  }

  // Pin time range
  spec.timeSettings = spec.timeSettings || {}
  spec.timeSettings.from = started.toISOString()
  spec.timeSettings.to = ended.toISOString()

  const elements = spec.elements || {}
  const panelCount = Object.values(elements).filter((e) => e.kind === 'Panel').length
  console.log(`panels   : ${panelCount}`)

  // scopedVars are passed alongside queries for completeness, even though our
  // local interpolate() has already rewritten the query strings.
  const scopedVars = Object.fromEntries(
    Object.entries(pinnedVars).map(([n, val]) =>
      [n, { text: val === '$__all' ? 'All' : val, value: val === '$__all' ? '.+' : val }]
    )
  )

  // For each panel: run queries → embed frames as a snapshot query
  for (const [elName, el] of Object.entries(elements)) {
    if (el.kind !== 'Panel') continue
    const dataSpec = el.spec.data.spec
    const queries = dataSpec.queries || []
    if (!queries.length) continue

    const v1Queries = []
    for (let i = 0; i < queries.length; i++) {
      const v1q = v2QueryToV1(queries[i])
      if (v1q.hide) continue
      v1q.refId = v1q.refId || String.fromCharCode(65 + i)
      for (const field of ['expr', 'query', 'rawSql', 'rawQuery']) {
        if (field in v1q) v1q[field] = interpolate(v1q[field], pinnedVars)
      }
      if (v1q.intervalMs == null) v1q.intervalMs = 15_000
      if (v1q.maxDataPoints == null) v1q.maxDataPoints = 1000
      v1Queries.push(v1q)
    }

    if (!v1Queries.length) continue

    let result
    try {
      result = await http('POST', '/api/ds/query', {
        queries: v1Queries,
        from: String(tFrom),
        to: String(tTo),
        scopedVars,
      })
    } catch (e) {
      process.stderr.write(`  ! query failed for ${elName}: ${e.message}\n`)
      continue
    }

    const frames = []
    for (const block of Object.values(result.results || {})) {
      for (const frame of (block.frames || [])) frames.push(frame)
    }

    dataSpec.queries = [makeSnapshotPanelQuery(frames)]
  }

  // Build snapshot payload
  spec.snapshot = { originalUrl: `/d/${DASHBOARD_UID}` }
  // K8s snapshot endpoint requires the dashboard's uid on the spec
  spec.uid = DASHBOARD_UID

  console.log('creating internal snapshot')
  const res = await http('POST', '/apis/dashboard.grafana.app/v0alpha1/namespaces/default/snapshots/create', {
    dashboard: spec,
    name: `perf-${runid}`,
    expires: 0,
    external: false,
  })
  if (typeof res.url === 'string' && res.url.startsWith('/')) res.url = GRAFANA_URL + res.url
  console.log(`snapshot : ${res.url}`)

  if (report) {
    const data = JSON.parse(fs.readFileSync(report, 'utf8'))
    data.grafanaSnapshot = { url: res.url }
    fs.writeFileSync(report, JSON.stringify(data, null, 2))
    console.log(`patched: ${report}`)
  }
}


main().catch((e) => { process.stderr.write(`${e.stack || e.message}\n`); process.exit(1) })
