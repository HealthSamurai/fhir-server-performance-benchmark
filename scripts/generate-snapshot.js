#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const params = {
    runId: process.env.RUNID || process.env.RUN_ID || null,
    metricsUrl: process.env.METRICS_URL || 'http://localhost:13010',
    username: process.env.METRICS_USERNAME,
    password: process.env.METRICS_PASSWORD,
    outputDir: path.join(process.cwd(), 'reports')
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--run-id':
      case '-r':
        params.runId = args[++i]
        break
      case '--metrics-url':
      case '-u':
        params.metricsUrl = args[++i]
        break
      case '--username':
        params.username = args[++i]
        break
      case '--password':
        params.password = args[++i]
        break
      case '--auth':
      case '-a':
        const [user, pass] = args[++i].split(':')
        params.username = user
        params.password = pass
        break
      case '--output':
      case '-o':
        params.outputDir = args[++i]
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
      default:
        if (!args[i].startsWith('-') && !params.runId) {
          params.runId = args[i]
        }
    }
  }

  if (!params.runId) {
    console.error('Error: run-id is required')
    printHelp()
    process.exit(1)
  }

  return params
}

function printHelp() {
  console.log(`
Usage: npm run snapshot -- [options] [<run-id>]

Generate a benchmark snapshot report from Prometheus metrics.

Options:
  -r, --run-id <id>        Test run ID to generate snapshot for
  -u, --metrics-url <url>  Prometheus server URL (default: http://localhost:13010)
  -a, --auth <user:pass>   Authentication credentials (user:password)
      --username <user>    Username for authentication
      --password <pass>    Password for authentication
  -o, --output <dir>       Output directory for snapshot (default: ./reports)
  -h, --help              Show this help message

Environment variables:
  RUNID, RUN_ID            Test run ID (used if not provided via CLI)
  METRICS_URL              Prometheus server URL
  METRICS_USERNAME         Username for authentication
  METRICS_PASSWORD         Password for authentication

Examples:
  npm run snapshot -- my-test-run
  npm run snapshot -- -r my-test-run -u http://prometheus:9090
  npm run snapshot -- -r my-test-run -a admin:secret
  RUNID=my-test-run npm run snapshot
  RUN_ID=my-test-run METRICS_URL=http://prometheus:9090 npm run snapshot
`)
}

// Metrics query functions
function getHeaders(username, password) {
  const headers = {
    'Accept': 'application/json',
  }

  if (username && password) {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64')
    headers['Authorization'] = `Basic ${base64Credentials}`
  }

  return headers
}

async function execute(metricsUrl, path, params, headers) {
  const queryParams = new URLSearchParams(params)

  try {
    const response = await fetch(`${metricsUrl}/api/v1/${path}?${queryParams}`, { headers })

    if (!response.ok) {
      const errorText = await response.text()
      if (response.status === 401) {
        throw new Error('Authentication failed: Invalid credentials')
      }
      throw new Error(`Prometheus query failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (data.status !== 'success') {
      throw new Error(`Prometheus query failed: ${data.error || 'Unknown error'}`)
    }

    return data
  } catch (error) {
    // Surface the underlying network/TLS reason — Node's fetch wraps the real
    // error in a generic "fetch failed" without details unless we look at .cause.
    if (error.cause) {
      console.error('  underlying cause:', error.cause)
    }
    throw new Error(`Failed to execute Prometheus query: ${error.message}`)
  }
}

async function instantQuery(metricsUrl, query, headers) {
  if (!query) {
    throw new Error('Query parameter is required')
  }
  return await execute(metricsUrl, 'query', { query }, headers)
}

// Query functions matching the original snapshot.ts
async function crudTotalRPS(metricsUrl, runid, headers) {
  return await instantQuery(
    metricsUrl,
    `sum by (fhirimpl, scenario) (avg_over_time(rate(k6_http_reqs_total{runid="${runid}", scenario="crud"}[5m])[24h:]))`,
    headers
  )
}

async function crudP99(metricsUrl, runid, headers) {
  return await instantQuery(
    metricsUrl,
    `sum by (fhirimpl, scenario, group) (avg_over_time(k6_http_req_duration_p99{runid="${runid}", scenario="crud"}[24h:])) * 1000`,
    headers
  )
}

async function importTotalRPS(metricsUrl, runid, headers) {
  return await instantQuery(
    metricsUrl,
    `sum by (fhirimpl, scenario) (avg_over_time(rate(k6_http_reqs_total{runid="${runid}", scenario="import"}[5m])[24h:]))`,
    headers
  )
}

async function importThroughput(metricsUrl, runid, headers) {
  return await instantQuery(
    metricsUrl,
    `sum by (fhirimpl) (avg_over_time(rate(k6_bundle_size_total{runid="${runid}"}[5m])[24h:]))`,
    headers
  )
}

async function searchTotalRPS(metricsUrl, runid, headers) {
  return await instantQuery(
    metricsUrl,
    `sum by (fhirimpl) (avg_over_time(rate(k6_http_reqs_total{runid="${runid}", scenario="search"}[5m])[24h:]))`,
    headers
  )
}

async function searchP99(metricsUrl, runid, headers) {
  return await instantQuery(
    metricsUrl,
    `sum by (fhirimpl, scenario, group) (avg_over_time(k6_http_req_duration_p99{runid="${runid}", scenario="search"}[24h:])) * 1000`,
    headers
  )
}

async function getSnapshot(metricsUrl, runid, headers) {
  return {
    crud: {
      summary: await crudTotalRPS(metricsUrl, runid, headers),
      test_cases: await crudP99(metricsUrl, runid, headers)
    },
    import: {
      summary: await importTotalRPS(metricsUrl, runid, headers),
      test_cases: await importThroughput(metricsUrl, runid, headers)
    },
    search: {
      summary: await searchTotalRPS(metricsUrl, runid, headers),
      test_cases: await searchP99(metricsUrl, runid, headers)
    }
  }
}

// Load the converter module dynamically
async function loadConverter() {
  try {
    const converterPath = path.join(__dirname, 'benchmark-converter.js')
    const { convertSourceData } = await import(converterPath)
    return { convertSourceData }
  } catch (error) {
    console.error('Note: benchmark-converter.js not found in scripts folder.')
    console.error('The raw snapshot data will be saved instead.')
    return null
  }
}

async function main() {
  const params = parseArgs()
  const headers = getHeaders(params.username, params.password)

  console.log(`Generating snapshot for run ID: ${params.runId}`)
  console.log(`Metrics URL: ${params.metricsUrl}`)

  try {
    // Get the snapshot data
    const snapshot = await getSnapshot(params.metricsUrl, params.runId, headers)

    // Create output directory if it doesn't exist
    await fs.mkdir(params.outputDir, { recursive: true })

    // Try to load the converter
    const converter = await loadConverter()
    
    if (converter) {
      // RUNID is the run start time (set in the CI configure step); ENDTIME is
      // captured right after the tests finish. Pass both so the report carries a
      // real runid/start/end/duration instead of a generated placeholder.
      const endTime = process.env.ENDTIME || process.env.END_TIME || null
      // Convert and save the report
      const report = converter.convertSourceData(snapshot, params.runId, params.runId, endTime)
      const reportPath = path.join(params.outputDir, `SNAPSHOT_${params.runId}.json`)
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
      console.log(`Benchmark report saved to: ${reportPath}`)
    }

    // Also save the raw source data
    const sourcePath = path.join(params.outputDir, `SOURCE_DATA_${params.runId}.json`)
    await fs.writeFile(sourcePath, JSON.stringify(snapshot, null, 2))
    console.log(`Source data saved to: ${sourcePath}`)

  } catch (error) {
    console.error('Error generating snapshot:', error.message)
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})