import http from 'k6/http'
import { check } from 'k6'
import { b64encode } from 'k6/encoding'

export function jsonPatch(obj, path, value) {
  let pt = obj;
  const ks = path.split('.');
  while (ks.length > 1) pt = pt[ks.shift()];
  pt[ks.shift()] = value;
  return obj;
}

export function escapeFhirValue(v) {
  return String(v).replace(/([\\,$|])/g, '\\$1');
}

export function pickRand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// A server that answers 500 (or 400) to everything answers fast, so failed
// checks alone still produce a flattering throughput chart — the run has to fail
// as a whole. abortOnFail stops the scenario instead of burning the full
// duration against a server that is clearly not doing the work; delayAbortEval
// leaves room for warm-up blips before the rate is judged.
export const strictThresholds = {
  checks: [{ threshold: 'rate>0.99', abortOnFail: true, delayAbortEval: '15s' }],
  http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '15s' }],
}

// Total number of resources matching `query` ('' = no filter), or null when the
// server declines to count. `_summary=count` plus an explicit `_total=accurate`
// is needed because MS FHIR ships IncludeTotalInBundle=None and omits the total
// otherwise.
export function searchTotal(baseUrl, resourceType, query, params) {
  const q = query ? `${query}&` : ''
  const res = http.get(
    `${baseUrl}/${resourceType}?${q}_summary=count&_total=accurate`,
    { ...params, responseType: 'text' })
  if (res.status !== 200) return null
  try {
    const total = JSON.parse(res.body).total
    return typeof total === 'number' ? total : null
  } catch (e) {
    return null
  }
}

export function is200 (url, params) {
  const res = http.get(url, params)
  return check(res, {'Status 200': ({ status }) => status === 200})
}

export function isOk (name, url, params) {
  const res = http.get(url, params)
  return check(res, { [name]: ({ status }) => status === 200 })
}

const oauth2 = () => {
  const user = __ENV.OAUTH2_USER
  const pass = __ENV.OAUTH2_PASSWORD

  if (!user || !pass) return null

  const loginURL = __ENV.OAUTH2_LOGIN_URL
  const tokenURL = __ENV.OAUTH2_TOKEN_URL

  if (!loginURL && !tokenURL) return null

  const challenge = "my_challenge"

  const authCode = http.post(loginURL, JSON.stringify({
    email: user,
    password: pass,
    codeChallengeMethod: "plain",
    codeChallenge: challenge,
  }), { headers: {"Content-Type": "application/json"}, responseType: 'text' })

  if (!check(authCode, { 'OAuth2 auth code': ({ status }) => status === 200 })) {
    console.log("auth code request failed:", authCode.body)
    return null
  }

  const token = http.post(
    tokenURL,
    `grant_type=authorization_code&code=${authCode.json('code')}&code_verifier=${challenge}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, responseType: 'text' })

  if (!check(token, { 'OAuth2 access token': ({ status }) => status === 200 })) {
    console.log('auth token request failed', token.body)
    return null
  }

  return {"Authorization": `Bearer ${token.json('access_token')}` }
}

export function headers() {
  return {
    ...oauth2(),
    "Accept-Encoding": "gzip",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
  }
}

const base64 = (user, pass) =>  user && pass ? `Basic ${b64encode(`${user}:${pass}`)}` : null

export default function() {
  const user = __ENV.AUTH_USER
  const pass = __ENV.AUTH_PASSWORD
  const auth = oauth2(user, pass) || base64(user, pass)

  console.log(JSON.stringify(auth ? { Authorization: auth } : {}))
}