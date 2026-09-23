import { supabase } from './supabase'

// Jedno pobranie na uruchomienie aplikacji, także przy React StrictMode.
// Nieudane pobranie można ponowić przyciskiem w katalogu.
let katalogPromise

export function pobierzKatalogProduktow() {
  if (!katalogPromise) {
    katalogPromise = Promise.resolve(
      supabase.from('Products').select('id, external_id, name')
        .order('name', { ascending: true })
    ).then(({ data, error }) => {
      if (error) throw error
      return data || []
    }).catch((error) => {
      katalogPromise = null
      throw error
    })
  }
  return katalogPromise
}

export function clearProductCatalog() { katalogPromise = null }
