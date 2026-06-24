import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'
import { headers } from './util.js'

const bundleSize = new Counter('bundle_size')

export const options = {
  discardResponseBodies: true,
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
  // Per-request ceiling. Under the 20-VU import load MS FHIR's slow tail of large
  // transaction bundles can sit behind others and exceed the old 500s, getting
  // failed as client timeouts (~1.8% of imports). 900s gives that tail room to
  // finish; it's only a ceiling, so the faster servers are unaffected.
  const params = { headers: headers(), timeout: '900s' }

  // Reset tgz's rotation cursor so every server starts from bundle #0 — each
  // FHIR impl then imports the exact same set of bundles in the same order.
  http.post(`${bundleUrl}/reset`, null)

  // First - load hospital and practitioner information
  const seeds = ["hospitalInformation.json", "practitionerInformation.json"]
  seeds.forEach(x => {
    const src = http.get(`${bundleUrl}/${x}`, {responseType: 'text'})
    http.post(baseUrl, src.body, params)
  })


  return { baseUrl, bundleUrl, params, }
}

export default function ({ baseUrl, bundleUrl, params, }) {
  const bundle = http.get( bundleUrl, { tags: { group: '::source' }, responseType: 'text' })
  const x = http.post( baseUrl, bundle.body, { ...params, tags: { group: '::import' } })

  if (!check(x, { ['Bundle import']: ({ status }) => status === 200 })) return
  bundleSize.add(JSON.parse(bundle.body).entry.length)
}
