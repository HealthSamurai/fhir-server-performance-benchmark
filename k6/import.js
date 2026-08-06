import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'
import { headers, searchTotal, strictThresholds } from './util.js'

const bundleSize = new Counter('bundle_size')
// A rejected bundle finishes fast, so a server that 400s a chunk of the dataset
// looks quick in iteration rate while persisting less. Count failures per status
// so the import result can't be read as throughput. Tagged, not logged, to avoid
// pulling multi-MB transaction-response bodies into the VU.
const importFail = new Counter('import_fail')

export const options = {
  discardResponseBodies: true,
  thresholds: strictThresholds,
  // setup() loads the two seed bundles (~1.6k entries each) before the run.
  // On MS FHIR each takes ~30s, blowing past k6's default 60s setupTimeout; the
  // other servers finish well inside it. This is only a ceiling, so raising it
  // is harmless for the fast servers.
  setupTimeout: '600s',
  scenarios: {
    import: {
      executor: 'shared-iterations',
      vus: 20,
      iterations: 1000,
      maxDuration: '60m',
      gracefulStop: '30s',
    },
  },
}

export function setup() {

  const bundleUrl = __ENV.BUNDLE_URL
  const baseUrl = __ENV.BASE_URL
  const hdrs = headers()

  // MS FHIR processes transaction-bundle entries sequentially by default, which
  // serializes hundreds of SQL INSERTs per bundle. This header opts into parallel
  // entry processing — Microsoft's own throughput tuning guidance, not a
  // workaround (see fhir-best-practices). Scoped to microsoft so every server is
  // run with its own recommended config; other servers would just ignore it.
  if (__ENV.FHIRIMPL === 'microsoft') {
    hdrs['x-bundle-processing-logic'] = 'parallel'
  }

  // Per-request ceiling. Under the 20-VU import load MS FHIR's slow tail of large
  // transaction bundles can sit behind others and exceed the old 500s, getting
  // failed as client timeouts (~1.8% of imports). 900s gives that tail room to
  // finish; it's only a ceiling, so the faster servers are unaffected.
  const params = { headers: hdrs, timeout: '900s' }

  // Reset tgz's rotation cursor so every server starts from bundle #0 — each
  // FHIR impl then imports the exact same set of bundles in the same order.
  http.post(`${bundleUrl}/reset`, null)

  // First - load hospital and practitioner information. Every later bundle
  // references these, so a silent failure here leaves the whole run importing
  // into a broken dataset — abort instead.
  const seeds = ["hospitalInformation.json", "practitionerInformation.json"]
  seeds.forEach(x => {
    const src = http.get(`${bundleUrl}/${x}`, {responseType: 'text'})
    const res = http.post(baseUrl, src.body, { ...params, responseType: 'text' })
    if (res.status !== 200) {
      throw new Error(`seed bundle ${x} rejected: HTTP ${res.status} ${(res.body || '').slice(0, 500)}`)
    }
  })


  return { baseUrl, bundleUrl, params, }
}

export default function ({ baseUrl, bundleUrl, params, }) {
  const bundle = http.get( bundleUrl, { tags: { group: '::source' }, responseType: 'text' })
  const x = http.post( baseUrl, bundle.body, { ...params, tags: { group: '::import' } })

  if (!check(x, { ['Bundle import']: ({ status }) => status === 200 })) {
    importFail.add(1, { status: String(x.status) })
    return
  }
  bundleSize.add(JSON.parse(bundle.body).entry.length)
}

// HTTP 200 on a transaction bundle says the server accepted it, not that the
// rows are queryable afterwards. Count what actually landed, once, after the
// run — a server that imported nothing can no longer look fast.
export function teardown({ baseUrl, params }) {
  const counted = ['Patient', 'Encounter', 'Observation', 'MedicationRequest', 'Organization', 'Practitioner']
  let total = 0
  counted.forEach(rt => {
    const n = searchTotal(baseUrl, rt, '', params)
    console.log(`persisted ${rt}: ${n === null ? 'NOT COUNTED BY SERVER' : n}`)
    if (n) total += n
  })
  if (total === 0) {
    throw new Error('import persisted nothing — every bundle either failed or was rolled back')
  }
}
