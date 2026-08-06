import { group, check } from 'k6'
import http from 'k6/http'
import searchSet from './searchConfig.js'
import {escapeFhirValue, pickRand, is200, isOk, headers, searchTotal, strictThresholds } from './util.js'

const SLOW_MS = 100

// Like isOk, but also prints the request if it took longer than SLOW_MS.
function isOkTimed(name, url, params) {
  const res = http.get(url, params)
  if (res.timings.duration > SLOW_MS) {
    console.log(`SLOW ${res.timings.duration.toFixed(0)}ms ${url}`)
  }
  return check(res, { [name]: ({ status }) => status === 200 })
}

export const options = {
  discardResponseBodies: true,
  thresholds: strictThresholds,
  // setup() runs real search queries (expandReferences -> sampleIds) against the
  // freshly-imported, cold dataset to pull live ids. On the slower servers
  // (medplum) those sampling queries blow past k6's default 60s setupTimeout,
  // which aborts the whole run and leaves that server with zero search metrics
  // (aidbox/hapi finish in time, so only medplum silently disappears). This is a
  // ceiling only, so raising it is harmless for the fast servers — mirrors the
  // same fix in import.js.
  setupTimeout: '600s',
  scenarios: {
    search: {

      executor: 'constant-vus',
      vus: 30,
      duration: '2m',
      gracefulStop: '30s',

      // executor: 'shared-iterations',
      // vus: 10,
      // iterations: 1000,
      // maxDuration: '2m',
    },
  },
}

const COUNT = 20

// Fetch up to `n` real ids of `resourceType` from the server. Returns [] on
// failure — the test will then exercise the search with a missing-id placeholder.
function sampleIds(baseUrl, resourceType, n, params) {
  const url = `${baseUrl}/${resourceType}?_count=${n}&_elements=id`
  const fetchParams = { ...params, responseType: 'text' }
  const res = http.get(url, fetchParams)
  if (res.status !== 200) {
    console.log(`sampleIds ${resourceType}: HTTP ${res.status} from ${url} body=${(res.body||'').slice(0,200)}`)
    return []
  }
  let bundle
  try { bundle = JSON.parse(res.body) } catch (e) {
    console.log(`sampleIds ${resourceType}: parse fail body=${(res.body||'').slice(0,200)}`)
    return []
  }
  const ids = (bundle.entry || [])
    .map(e => e && e.resource && e.resource.id)
    .filter(Boolean)
  if (ids.length === 0) {
    console.log(`sampleIds ${resourceType}: empty. total=${bundle.total} entry-len=${(bundle.entry||[]).length} body=${res.body.slice(0,200)}`)
  }
  return ids
}

// Build values for a reference SP: a missing-id placeholder, all sampled ids
// as singletons, plus one 2-id and one 3-id FHIR-OR list to exercise that path.
function buildRefValues(resourceType, ids) {
  if (!ids.length) return [`${resourceType}/non-existent-id`]
  const ref = id => `${resourceType}/${id}`
  return [
    `${resourceType}/non-existent-id`,
    ...ids.map(ref),
    ids.slice(0, 2).map(ref).join(','),
    ids.slice(0, 3).map(ref).join(','),
  ]
}

// For every reference SP entry with `valueRef`, sample real ids from the
// server and replace it with a populated `values` array.
function expandReferences(set, baseUrl, params) {
  const refs = set.reference
  if (!refs) return set
  const cache = {}
  for (const rt of Object.keys(refs)) {
    for (const sp of Object.keys(refs[rt])) {
      const conf = refs[rt][sp]
      if (!conf || !conf.valueRef) continue
      const targetRt = conf.valueRef
      if (!cache[targetRt]) {
        cache[targetRt] = sampleIds(baseUrl, targetRt, 20, params)
        console.log(`sampled ${targetRt}: ${cache[targetRt].length} ids`)
      }
      conf.values = buildRefValues(targetRt, cache[targetRt])
      delete conf.valueRef
    }
  }
  return set
}

// HTTP 200 does not mean the search ran. Servers default to lenient handling:
// a parameter they don't index is dropped and the answer is an unfiltered page,
// which is both fast and green. Probe every configured parameter once before
// measuring anything and refuse to produce numbers for a suite where some
// queries are decorative.
//
// The decisive probe is every entry's values[0], which is deliberately a value
// nothing can match ("NON-EXISTS", a 2070 date, Patient/non-existent-id). A
// working parameter narrows the result set; an ignored one returns the whole
// collection no matter what it is handed. That comparison holds whatever the
// dataset contains, unlike "did values[1] find anything", which only says
// whether this particular corpus happens to hold that value — so a miss there
// is reported but not fatal.
//
// Modifiers and prefixes are left off: this asks whether the parameter is wired
// up at all, not whether every variant of it is correct.
function assertSearchesActuallyFilter(set, baseUrl, params) {
  const ignored = []
  const noRecall = []
  const unfilteredCache = {}

  for (const searchType of Object.keys(set)) {
    for (const resourceType of Object.keys(set[searchType])) {
      if (!(resourceType in unfilteredCache)) {
        unfilteredCache[resourceType] = searchTotal(baseUrl, resourceType, '', params)
      }
      const unfiltered = unfilteredCache[resourceType]
      if (!unfiltered) continue // nothing imported for this type; nothing to prove

      for (const name of Object.keys(set[searchType][resourceType])) {
        const values = set[searchType][resourceType][name].values || []
        const encode = v => encodeURIComponent(searchType === 'string' ? escapeFhirValue(v) : v)

        if (values[0] !== undefined) {
          const query = `${name}=${encode(values[0])}`
          const matched = searchTotal(baseUrl, resourceType, query, params)
          if (matched === null) {
            ignored.push(`${resourceType}?${query}: server returned no total, cannot verify the parameter is applied`)
          } else if (matched === unfiltered) {
            ignored.push(`${resourceType}?${query}: returned all ${unfiltered} resources for a value nothing matches — parameter silently dropped`)
          }
        }

        if (values[1] !== undefined) {
          const query = `${name}=${encode(values[1])}`
          const matched = searchTotal(baseUrl, resourceType, query, params)
          if (matched === 0) {
            noRecall.push(`${resourceType}?${query}: 0 of ${unfiltered}`)
          }
        }
      }
    }
  }

  if (noRecall.length) {
    console.warn(
      `${noRecall.length} search parameter(s) found nothing — these measure empty result sets, ` +
      `check the dataset was fully imported:\n  - ${noRecall.join('\n  - ')}`)
  }

  if (ignored.length) {
    throw new Error(
      `${ignored.length} search parameter(s) are not applied by this server; ` +
      `their timings would be pure noise:\n  - ${ignored.join('\n  - ')}`)
  }
}

export function setup() {
  const baseUrl = __ENV.BASE_URL
  const params = { headers: headers(), timeout: '300s' }
  const expandedSet = expandReferences(searchSet, baseUrl, params)
  assertSearchesActuallyFilter(expandedSet, baseUrl, params)
  return { baseUrl, params, searchSet: expandedSet }
}


// In FHIR search, `, $ |` are structural separators (list/composite/token
// system|code). For `string`-type SPs the value is plain text where these
// chars need escaping; for token/quantity/composite/reference the value is
// already pre-formatted with structural separators and must pass through.
function genRandSearchParamQuery(searchType, name, searchConfig) {
  const value = pickRand(searchConfig.values);
  const modifier = searchConfig.modifiers ? pickRand(searchConfig.modifiers) : '';
  const prefix = searchConfig.prefixes ? pickRand(searchConfig.prefixes) : '';
  const escaped = searchType === 'string' ? escapeFhirValue(value) : value;
  return `${name}${modifier}=${prefix}${encodeURIComponent(escaped)}`;
}

function testSingleSearchType(searchType, baseUrl, params, searchSet) {

  group(searchType, () => {
    const searchTypeGroup = searchSet[searchType]
    for (const resourceType of Object.keys(searchTypeGroup)) {
      group(resourceType, () => {
      const searchTypeParameters = searchTypeGroup[resourceType]
        for (const name of Object.keys(searchTypeParameters)) {
          group(name, () => {
            const currentParamaterConfig = searchTypeParameters[name]
            const query = genRandSearchParamQuery(searchType, name, currentParamaterConfig)
            const searchRequest = `${baseUrl}/${resourceType}?${query}&_count=${COUNT}`
            // console.log(searchRequest);
            const reqParams = { ...params, tags: { name, resourceType , searchType } }
            isOk(`${resourceType}?${name}`, searchRequest, reqParams)
            //isOkTimed(`${resourceType}?${name}`, searchRequest, reqParams)

          })
        }
      })
    }
  })

}

export default function ({ baseUrl, params, searchSet }) {
  for(const searchType of Object.keys(searchSet)) {
    testSingleSearchType(searchType, baseUrl, params, searchSet)
  }
}
