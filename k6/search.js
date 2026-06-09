import { group } from 'k6'
import searchSet from './search/searchConfig.js'  
import {pickRand, is200, isOk, headers } from './util.js'

export const options = {
  discardResponseBodies: true,
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

export function setup() {
  return {
    baseUrl: __ENV.BASE_URL,
    params: { headers: headers() },
    searchSet
  }
}

// Escape FHIR-special chars in a single value: , $ | (per FHIR search spec
// these are list/composite/token separators); also escape backslash itself.
function escapeFhirValue(v) {
  return String(v).replace(/([\\,$|])/g, '\\$1');
}

function genRandSearchParamQuery(name, searchConfig) {
  const value = pickRand(searchConfig.values);
  const modifier = searchConfig.modifiers ? pickRand(searchConfig.modifiers) : '';
  const prefix = searchConfig.prefixes ? pickRand(searchConfig.prefixes) : '';
  return `${name}${modifier}=${prefix}${encodeURIComponent(escapeFhirValue(value))}`;
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
            const query = genRandSearchParamQuery(name, currentParamaterConfig)
            const searchRequest = `${baseUrl}/${resourceType}?${query}&_count=${COUNT}`
            // console.log(searchRequest);
            const reqParams = { ...params, tags: { name, resourceType , searchType } }
            isOk(`${resourceType}?${name}`, searchRequest, reqParams)
          })
        }
      })
    }
  })

}

export default function ({ baseUrl, params, queries }) {
  for(const searchType of Object.keys(searchSet)) {
    testSingleSearchType(searchType, baseUrl, params, searchSet)
  }
}
