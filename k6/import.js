import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'
import { headers } from './util.js'

const bundleSize = new Counter('bundle_size')

export const options = {
  discardResponseBodies: true,
  scenarios: {
    import: {
      executor: 'constant-vus',
      vus: 20,
      duration: '5m',
      gracefulStop: '30s',
    },
  },
}

export function setup() {

  const bundleUrl = __ENV.BUNDLE_URL
  const baseUrl = __ENV.BASE_URL
  const params = { headers: headers(), timeout: '300s' }

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
