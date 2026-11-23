import http from 'k6/http'
import { check, sleep } from 'k6'
import { Gauge } from 'k6/metrics'
import crypto from 'k6/crypto'
import encoding from 'k6/encoding'
import { headers } from './util.js'

// FHIR Bulk Data Export ($export) throughput.
//
// One export is one long k6 iteration: kick the export off, poll its status
// URL until the server publishes the manifest, then measure what it wrote. The
// headline number is MB/s — bytes of NDJSON output divided by the wall time
// from the kick-off request to the completed manifest (1 MB = 10^6 bytes).
//
// Where the output goes (EXPORT_STORAGE, set per server in runner.sh):
//   s3     — RustFS, the `fhir-export` bucket (servers with an S3 client)
//   azure  — Azurite, the `fhir-export` container (Microsoft FHIR: Azure only)
//   server — kept by the server itself (HAPI: Binary resources in its DB)
// The bucket/container is emptied before and after every server, so whatever
// is in it belongs to the export under test, whatever key layout the server
// uses. Output kept by the server is measured from the manifest: the size of
// every output file is probed with a ranged GET.
//
// All results are gauges set once per run, so the snapshot reads them with
// max_over_time; export_progress_bytes is the live view in Grafana while the
// export is still running.

const exportDuration = new Gauge('export_duration_seconds')
const exportSize = new Gauge('export_size_bytes')
const exportResources = new Gauge('export_resources')
const exportFiles = new Gauge('export_files')
const exportMBps = new Gauge('export_mb_per_second')
const exportResourcesPerSecond = new Gauge('export_resources_per_second')
const exportProgress = new Gauge('export_progress_bytes')

const MB = 1e6
const POLL_INTERVAL = Number(__ENV.EXPORT_POLL_INTERVAL || 2)
// Listing the sink is cheap, but there is no need to do it on every status poll.
const PROGRESS_INTERVAL = Number(__ENV.EXPORT_PROGRESS_INTERVAL || 10)

export const options = {
  discardResponseBodies: true,
  setupTimeout: '300s',
  teardownTimeout: '600s',
  scenarios: {
    export: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      // Ceiling only: the iteration ends as soon as the manifest is ready.
      maxDuration: __ENV.EXPORT_MAX_DURATION || '90m',
      gracefulStop: '30s',
    },
  },
}

const storage = () => __ENV.EXPORT_STORAGE || 's3'

const xmlValues = (xml, tag) =>
  [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1])

const xmlUnescape = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

const totalSize = (objects) => objects.reduce((sum, o) => sum + o.size, 0)

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/')

// --- export sinks: list() -> [{ key, size }] of everything the export under
// test wrote; clear() removes it and returns what was there. -----------------

// RustFS. The bucket has an anonymous policy, so plain unsigned HTTP is enough.
const s3Url = () => __ENV.S3_URL || 'http://rustfs:9000/fhir-export'

const s3 = {
  name: 'RustFS',
  // ListObjectsV2 pages by 1000.
  list() {
    const objects = []
    let token = null
    do {
      const url = `${s3Url()}?list-type=2&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`
      const res = http.get(url, { responseType: 'text', tags: { name: 's3-list', group: '::sink' } })
      if (res.status !== 200) {
        throw new Error(`RustFS bucket listing failed: HTTP ${res.status} ${(res.body || '').slice(0, 300)}`)
      }
      for (const c of res.body.split('<Contents>').slice(1)) {
        objects.push({ key: xmlUnescape(xmlValues(c, 'Key')[0]), size: Number(xmlValues(c, 'Size')[0]) })
      }
      token = xmlValues(res.body, 'IsTruncated')[0] === 'true' ? xmlUnescape(xmlValues(res.body, 'NextContinuationToken')[0]) : null
    } while (token)
    return objects
  },
  clear() {
    const objects = this.list()
    for (const o of objects) {
      const res = http.del(`${s3Url()}/${encodeKey(o.key)}`, null, { tags: { name: 's3-delete', group: '::sink' } })
      if (res.status !== 204 && res.status !== 200 && res.status !== 404) {
        console.warn(`RustFS: failed to delete ${o.key}: HTTP ${res.status}`)
      }
    }
    return objects
  },
}

// Azurite (Azure Blob emulator, for Microsoft FHIR). The server exports into
// one container (kick-off with _container=...). Azure has no anonymous write or
// list, so requests carry an account SAS signed with the emulator's well-known
// dev account key.
const azureUrl = () => __ENV.AZURE_BLOB_URL || 'http://azurite:10000/devstoreaccount1'
const azureContainer = () => __ENV.AZURE_CONTAINER || 'fhir-export'
const AZURE_ACCOUNT = __ENV.AZURE_ACCOUNT || 'devstoreaccount1'
const AZURE_KEY = __ENV.AZURE_ACCOUNT_KEY ||
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=='

// Account SAS (blob service; service/container/object level; read, write,
// delete, list), https://learn.microsoft.com/rest/api/storageservices/create-account-sas
function azureSas() {
  const sv = '2021-08-06'
  const se = '2099-12-31T00:00:00Z'
  const [ss, srt, sp, spr] = ['b', 'sco', 'rwdl', 'https,http']
  // account, permissions, services, resource types, start, expiry, IP,
  // protocol, version, encryption scope
  const toSign = [AZURE_ACCOUNT, sp, ss, srt, '', se, '', spr, sv, ''].join('\n') + '\n'
  const sig = crypto.hmac('sha256', encoding.b64decode(AZURE_KEY), toSign, 'base64')
  return `sv=${sv}&ss=${ss}&srt=${srt}&sp=${sp}&se=${encodeURIComponent(se)}&spr=${encodeURIComponent(spr)}&sig=${encodeURIComponent(sig)}`
}

const azure = {
  name: 'Azurite',
  // List Blobs pages by up to 5000; a container the server hasn't created yet
  // is simply empty.
  list() {
    const blobs = []
    let marker = ''
    do {
      const url = `${azureUrl()}/${azureContainer()}?restype=container&comp=list&maxresults=5000` +
        `${marker ? `&marker=${encodeURIComponent(marker)}` : ''}&${azureSas()}`
      const res = http.get(url, {
        responseType: 'text',
        responseCallback: http.expectedStatuses(200, 404),
        tags: { name: 'azure-list', group: '::sink' },
      })
      if (res.status === 404) return blobs
      if (res.status !== 200) {
        throw new Error(`Azurite container listing failed: HTTP ${res.status} ${(res.body || '').slice(0, 300)}`)
      }
      for (const b of res.body.split('<Blob>').slice(1)) {
        blobs.push({ key: xmlUnescape(xmlValues(b, 'Name')[0]), size: Number(xmlValues(b, 'Content-Length')[0]) })
      }
      marker = xmlUnescape(xmlValues(res.body, 'NextMarker')[0] || '')
    } while (marker)
    return blobs
  },
  // Drop the whole container; the server creates it again on the next export.
  clear() {
    const blobs = this.list()
    const res = http.del(`${azureUrl()}/${azureContainer()}?restype=container&${azureSas()}`, null, {
      responseCallback: http.expectedStatuses(202, 404),
      tags: { name: 'azure-delete', group: '::sink' },
    })
    if (res.status !== 202 && res.status !== 404) {
      console.warn(`Azurite: failed to delete container ${azureContainer()}: HTTP ${res.status}`)
    }
    return blobs
  },
}

// undefined for EXPORT_STORAGE=server: the output is measured from the manifest.
const sink = () => ({ s3, azure })[storage()]

// --- output stored by the FHIR server itself ---------------------------------

// Size of one manifest output file. A ranged GET returns the full size in
// Content-Range without transferring the file; servers that ignore Range send
// the whole file, which is then counted from Content-Length or the body itself.
function outputFileSize(url, params) {
  // Accept ndjson: asked for FHIR JSON, HAPI wraps the file in a base64 Binary.
  const res = http.get(url, {
    headers: { ...params.headers, Accept: 'application/fhir+ndjson', Range: 'bytes=0-0' },
    responseType: 'binary',
    timeout: '900s',
    tags: { name: 'export-output', group: '::export::output' },
  })
  if (res.status === 206) {
    const total = Number(((res.headers['Content-Range'] || '').split('/')[1]))
    if (total > 0) return total
  }
  if (res.status !== 200) {
    console.warn(`export output ${url}: HTTP ${res.status}`)
    return 0
  }
  return res.body ? res.body.byteLength : Number(res.headers['Content-Length'] || 0)
}

// --- the test ------------------------------------------------------------------

// Servers build status and file URLs from their public base URL (Aidbox and
// Medplum: http://localhost:...), which doesn't resolve inside the compose
// network. Keep the path, take scheme and host from BASE_URL (relative URLs
// are resolved against it too).
const origin = (url) => (url.match(/^https?:\/\/[^/]+/) || [''])[0]
const rebase = (url) =>
  url.startsWith('/') ? origin(__ENV.BASE_URL) + url : origin(__ENV.BASE_URL) + url.slice(origin(url).length)

export function setup() {
  const hdrs = headers()
  // $export is asynchronous; the manifest is FHIR JSON.
  hdrs['Accept'] = 'application/fhir+json'
  hdrs['Prefer'] = 'respond-async'
  delete hdrs['Content-Type']

  if (sink()) {
    const leftovers = sink().clear()
    if (leftovers.length) console.log(`${sink().name}: removed ${leftovers.length} objects left over from a previous run`)
  }

  return {
    kickoffUrl: `${__ENV.BASE_URL}${__ENV.EXPORT_PATH || '/$export'}${__ENV.EXPORT_PARAMS ? `?${__ENV.EXPORT_PARAMS}` : ''}`,
    params: { headers: hdrs, timeout: '900s' },
  }
}

const authHeaders = () => {
  const { Authorization } = headers()
  return Authorization ? { Authorization } : {}
}

export default function ({ kickoffUrl, params }) {
  const started = Date.now()

  // GET: the one kick-off form every server takes (Aidbox has no POST at the
  // system level).
  const kickoff = http.get(kickoffUrl, {
    ...params,
    responseType: 'text',
    tags: { name: 'export-kickoff', group: '::export::kickoff' },
  })
  const statusUrl = kickoff.headers['Content-Location'] && rebase(kickoff.headers['Content-Location'])
  if (!check(kickoff, { 'Export kick-off': (r) => r.status === 202 && !!statusUrl })) {
    console.error(`export kick-off ${kickoffUrl}: HTTP ${kickoff.status} ${(kickoff.body || '').slice(0, 500)}`)
    return
  }
  console.log(`export started: ${statusUrl}`)

  let status
  let lastProgress = 0
  let reauthenticated = false
  for (;;) {
    sleep(POLL_INTERVAL)
    status = http.get(statusUrl, {
      ...params,
      responseType: 'text',
      responseCallback: http.expectedStatuses(200, 202, 401),
      tags: { name: 'export-status', group: '::export::status' },
    })
    // A long export can outlive an OAuth token (Medplum's last an hour):
    // log in again, once — a 401 right after that is a real failure.
    if (status.status === 401 && !reauthenticated) {
      reauthenticated = true
      params = { ...params, headers: { ...params.headers, ...authHeaders() } }
      continue
    }
    reauthenticated = false
    if (status.status !== 202) break

    if (sink() && Date.now() - lastProgress >= PROGRESS_INTERVAL * 1000) {
      lastProgress = Date.now()
      exportProgress.add(totalSize(sink().list()))
    }
  }
  const seconds = (Date.now() - started) / 1000

  if (!check(status, { 'Export completed': (r) => r.status === 200 })) {
    console.error(`export status ${statusUrl}: HTTP ${status.status} ${(status.body || '').slice(0, 500)}`)
    return
  }

  const manifest = JSON.parse(status.body)
  const outputs = manifest.output || []
  const resources = outputs.reduce((sum, o) => sum + (Number(o.count) || 0), 0)

  let bytes
  if (sink()) {
    const objects = sink().list()
    bytes = totalSize(objects)
    exportFiles.add(objects.length)
  } else {
    bytes = outputs.reduce((sum, o) => sum + outputFileSize(rebase(o.url), params), 0)
    exportFiles.add(outputs.length)
  }
  exportProgress.add(bytes)

  check(manifest, {
    'Export has output': () => outputs.length > 0 && bytes > 0,
    'Export has no errors': () => (manifest.error || []).length === 0,
  })

  exportDuration.add(seconds)
  exportSize.add(bytes)
  exportResources.add(resources)
  exportMBps.add(bytes / MB / seconds)
  exportResourcesPerSecond.add(resources / seconds)

  console.log(
    `export done in ${seconds.toFixed(1)}s: ${outputs.length} manifest files, ` +
    `${resources} resources, ${(bytes / MB).toFixed(1)} MB, ` +
    `${(bytes / MB / seconds).toFixed(2)} MB/s, ${(resources / seconds).toFixed(0)} resources/s`)

  // Let the server drop the job and whatever it keeps for it. Some servers
  // answer 404 for a job that has already completed; that's fine too.
  http.del(statusUrl, null, {
    ...params,
    responseCallback: http.expectedStatuses(200, 202, 204, 404),
    tags: { name: 'export-delete', group: '::export::delete' },
  })
}

export function teardown() {
  if (sink()) {
    const removed = sink().clear()
    console.log(`${sink().name}: removed ${removed.length} objects (${(totalSize(removed) / MB).toFixed(1)} MB)`)
  }
}
