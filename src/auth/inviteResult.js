// Exact existing invite-employee response. Keep this mapping covered against the
// Edge Function source: a generic 409 does not mean that an email was sent.
const partialInviteError = 'Zaproszenie wysłano, ale konto wymaga ręcznego powiązania. Nie ponawiaj zaproszenia.'
const genericMessage = 'Nie udało się połączyć konta. Sprawdź konfigurację zaproszeń; istniejące konto Auth wymaga powiązania przez administratora bazy.'

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
  return { partial: false, message: genericMessage }
}
