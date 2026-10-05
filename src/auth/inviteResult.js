// Exact existing invite-employee response. Keep this mapping covered against the
// Edge Function source: a generic 409 does not mean that an email was sent.
const partialInviteError = 'Zaproszenie wysłano, ale konto wymaga ręcznego powiązania. Nie ponawiaj zaproszenia.'
const genericMessage = 'Nie udało się potwierdzić zaproszenia. Sprawdź dostępność funkcji invite-employee, CORS i konfigurację Auth. Ten błąd nie potwierdza istnienia konta.'
const knownFailures = {
  AUTH_ACCOUNT_EXISTS: 'Konto Auth już istnieje. Administrator bazy musi zweryfikować tożsamość i powiązania przed połączeniem z pracownikiem.',
  INVITE_EMAIL_NOT_AUTHORIZED: 'Dostawca poczty nie dopuszcza tego odbiorcy. Administrator UAT musi skonfigurować SMTP.',
  INVITE_RATE_LIMIT: 'Limit wysyłania zaproszeń. Spróbuj ponownie później.',
  INVITE_PROVIDER_FAILED: 'Usługa Auth nie potwierdziła wysłania zaproszenia. Administrator powinien sprawdzić logi Auth i konfigurację SMTP.',
}

export async function invitationFailure({ data, error }) {
  if (!error && !data?.error) return null
  let body = data
  if (error?.name === 'FunctionsHttpError') {
    try {
      body = await error.context.clone().json()
    } catch {
      return { partial: false, message: genericMessage }
    }
  }
  if ((!error || (error.name === 'FunctionsHttpError' && error.context.status === 409)) &&
      body?.error === partialInviteError) {
    return {
      partial: true,
      message: 'Zaproszenie zostało wysłane, ale konto nie zostało powiązane z pracownikiem. Nie wysyłaj zaproszenia ponownie. Wymagana jest interwencja administratora.',
    }
  }
  if (Object.hasOwn(knownFailures, body?.code ?? '')) {
    return { partial: false, message: knownFailures[body.code] }
  }
  return { partial: false, message: genericMessage }
}
