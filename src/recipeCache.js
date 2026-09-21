import { supabase } from './supabase'

// Cache obietnic współdzieli również trwające odczyty między kartami i StrictMode.
// Brak produktu / pusta receptura też są wynikiem. Błędy można ponowić.
const recipes = new Map()

export function loadRecipe(externalId) {
  const key = String(externalId)
  if (!recipes.has(key)) {
    const request = Promise.all([
      supabase.from('Products').select('external_id, name, gramatura')
        .eq('external_id', externalId).maybeSingle(),
      supabase.from('Recipe_ingredients')
        .select('product_external_id, ingredient_external_id, ingredient_name, netto, brutto')
        .eq('product_external_id', externalId),
    ]).then(([product, ingredients]) => {
      if (product.error) throw product.error
      if (ingredients.error) throw ingredients.error
      return { product: product.data, ingredients: ingredients.data || [] }
    }).catch((error) => {
      recipes.delete(key)
      throw error
    })
    recipes.set(key, request)
  }
  return recipes.get(key)
}
