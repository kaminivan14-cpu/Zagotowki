// Pure, single-level calculation. Source recipe/cache objects are never modified.
function numeric(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim())) return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

export function scaleRecipe(product, ingredients, requestedQuantity, unit, rootScaleFactor) {
  const failure = (error) => ({ error, requestedGrams: null, factor: null, ingredients: [] })
  if (!product) return failure('Nie znaleziono produktu w katalogu.')
  let requestedGrams = null
  let factor
  if (rootScaleFactor !== undefined) {
    // Nested recipes retain the root production factor, regardless of child base weight.
    factor = numeric(rootScaleFactor)
    if (factor === null || factor < 0) return failure('Nie można przeliczyć receptury: brak poprawnego współczynnika produktu głównego.')
  } else {
    const base = numeric(product.gramatura)
    if (base === null || base <= 0) return failure('Nie można przeliczyć receptury: brak poprawnej gramatury bazowej.')
    if (unit !== 'g' && unit !== 'kg') return failure('Nie można przeliczyć receptury: wymagana ilość w g lub kg. Brak przelicznika masy dla tej jednostki.')
    const quantity = numeric(requestedQuantity)
    if (quantity === null || quantity < 0) return failure('Nie można przeliczyć receptury: nieprawidłowa ilość do przygotowania.')
    requestedGrams = quantity * (unit === 'kg' ? 1000 : 1)
    factor = requestedGrams / base
    if (!Number.isFinite(requestedGrams) || !Number.isFinite(factor) ||
      (quantity > 0 && (requestedGrams === 0 || factor === 0))) {
      return failure('Nie można przeliczyć receptury: ilość poza zakresem obliczeń.')
    }
  }
  if (!ingredients?.length) return failure('Brak składników receptury dla tego produktu.')
  return {
    error: null, requestedGrams, factor,
    ingredients: ingredients.map((ingredient) => {
      const gross = numeric(ingredient.brutto)
      if (gross === null || gross < 0) return { ...ingredient, requiredGross: null, error: 'Brak poprawnej wartości brutto.' }
      const requiredGross = gross * factor
      if (!Number.isFinite(requiredGross) || (gross > 0 && factor > 0 && requiredGross === 0)) {
        return { ...ingredient, requiredGross: null, error: 'Wynik poza zakresem obliczeń.' }
      }
      return { ...ingredient, requiredGross, error: null }
    }),
  }
}

// A path belongs to one branch: the same product in a sibling is not a cycle.
export function extendRecipePath(path, externalId) {
  if (externalId == null) return null
  const id = String(externalId)
  if (path.some((visited) => String(visited) === id)) return null
  return [...path, id]
}
