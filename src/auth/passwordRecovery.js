// Capture routing intent before Supabase consumes/removes the callback hash.
// Never persist the tokens or trust this marker as proof of authentication.
export function passwordRedirect(href) {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const hasError = ['error', 'error_code', 'error_description'].some(key =>
    hash.has(key) || url.searchParams.has(key))
  return {
    requested: url.searchParams.get('auth') === 'password' ||
      hash.get('type') === 'recovery' || url.searchParams.get('type') === 'recovery' || hasError,
    hasError,
  }
}

export const invalidPasswordLink = 'Link jest nieważny lub wygasł. Poproś o nowy link przez „Nie pamiętam hasła”.'
