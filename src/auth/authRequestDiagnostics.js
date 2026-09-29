// Temporary diagnostics. Only known public error text may leave the response body.
const safeErrorText = new Set([
  'Invalid API key',
  'Double check the provided API key for typos. This API key might also be owned by another Supabase project.',
])

function sanitizedErrorBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '[REDACTED]'
  return Object.fromEntries(['message', 'msg', 'hint', 'code', 'error', 'error_description']
    .filter(key => Object.hasOwn(body, key))
    .map(key => [key, safeErrorText.has(body[key]) ? body[key] : '[REDACTED]']))
}

// Logging itself must not interfere with transport, even if Console is unavailable.
function log(stage, fields = {}) {
  try { console.info('[auth-request-diag]', { stage, ...fields }) } catch { /* Ignore Console failures. */ }
}

export function createAuthDiagnosticFetch(fetchImpl = globalThis.fetch.bind(globalThis)) {
  return async (input, options) => {
    log('FETCH_ENTER')
    let metadata
    let key
    try {
      const request = input instanceof Request ? input : null
      const url = new URL(request ? request.url : input, globalThis.location?.href)
      if (url.pathname === '/auth/v1/user') {
        metadata = { hostname: url.hostname, pathname: url.pathname,
          method: (options?.method ?? request?.method ?? 'GET').toUpperCase() }
        try {
          const headers = new Headers(options?.headers !== undefined ? options.headers : request?.headers)
          key = headers.get('apikey')
          Object.assign(metadata, { apikeyExists: key !== null, apikeyLength: key?.length ?? 0,
            authorizationExists: headers.has('Authorization') })
        } catch { log('HEADERS_FAILED', metadata) }
        log('REQUEST', metadata)
      }
    } catch { log('METADATA_FAILED') }

    let response
    try { response = await fetchImpl(input, options) }
    catch (error) {
      if (metadata) log('FETCH_FAILED', metadata)
      throw error
    }
    if (metadata) {
      const fields = { ...metadata, status: response.status }
      log('RESPONSE', fields)
      // Independent tasks: fingerprint failure cannot hide the response body (or vice versa).
      if (typeof key === 'string') {
        void (async () => {
          try {
            const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
            const apikeySha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
            log('SHA256_OK', { ...fields, apikeySha256 })
          } catch { log('SHA256_FAILED', fields) }
        })()
      }
      if (!response.ok) {
        try {
          const copy = response.clone()
          void (async () => {
            try { log('ERROR_BODY', { ...fields, responseBody: sanitizedErrorBody(await copy.json()) }) }
            catch { log('BODY_FAILED', fields) }
          })()
        } catch { log('BODY_FAILED', fields) }
      }
    }
    return response
  }
}
