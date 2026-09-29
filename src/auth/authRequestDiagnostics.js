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

export function createAuthDiagnosticFetch(fetchImpl = globalThis.fetch.bind(globalThis)) {
  return async (input, options) => {
    // Snapshot effective headers without consuming or replacing a Request body.
    let metadata
    try {
      const request = input instanceof Request ? input : null
      const url = new URL(request ? request.url : input, globalThis.location?.href)
      if (url.pathname === '/auth/v1/user') {
        const headers = new Headers(options?.headers !== undefined ? options.headers : request?.headers)
        metadata = {
          hostname: url.hostname,
          pathname: url.pathname,
          method: (options?.method ?? request?.method ?? 'GET').toUpperCase(),
          key: headers.get('apikey'),
        }
      }
    } catch { /* Diagnostics must never prevent the original fetch. */ }

    const response = await fetchImpl(input, options)
    if (metadata) {
      try {
        const copy = response.ok ? null : response.clone()
        // Do not delay SDK processing or consume its response body.
        void (async () => {
          const { key, ...fields } = metadata
          const record = { ...fields, status: response.status,
            apikeyExists: key !== null, apikeyLength: key?.length ?? 0 }
          if (key !== null) {
            const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
            record.apikeySha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
          }
          if (copy) {
            try { record.responseBody = sanitizedErrorBody(await copy.json()) }
            catch { record.responseBody = '[REDACTED: unreadable or non-JSON body]' }
          }
          console.info('[auth-request-diag]', record)
        })().catch(() => {})
      } catch { /* Diagnostics must never change the SDK response. */ }
    }
    return response
  }
}
