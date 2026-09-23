// Pure, single-level calculation. Source recipe/cache objects are never modified.
function numeric(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim())) return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

export function normalizeRecipeUnit(value) {
  if (typeof value !== 'string') return null
  const unit = value.trim().toLowerCase()
  if (unit === 'szt' || unit === 'szt.') return 'szt.'
  return unit === 'g' || unit === 'ml' ? unit : null
}

// Explicit baseUnit opts into source-unit validation. Existing TechnologyCard calls
// keep their original mass-only contract; the root factor formula is unchanged.
export function scaleRecipe(product, ingredients, requestedQuantity, unit, rootScaleFactor, baseUnit) {
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
    let multiplier = unit === 'kg' ? 1000 : 1
    let massQuantity = true
    if (baseUnit !== undefined) {
      const normalizedBase = normalizeRecipeUnit(baseUnit)
      if (!normalizedBase) return failure('Brak lub nieobsługiwana jednostka gramatury bazowej półproduktu (dozwolone: g, ml, szt.).')
      const plannedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : ''
      // Preserve the existing kg -> g conversion for plan quantities only.
      const normalizedPlan = plannedUnit === 'kg' ? 'g' : normalizeRecipeUnit(plannedUnit)
      if (normalizedPlan !== normalizedBase) return failure('Jednostka ilości w planie jest niezgodna z jednostką bazową półproduktu; brak przelicznika.')
      multiplier = plannedUnit === 'kg' ? 1000 : 1
      massQuantity = normalizedBase === 'g'
    } else if (unit !== 'g' && unit !== 'kg') {
      return failure('Nie można przeliczyć receptury: wymagana ilość w g lub kg. Brak przelicznika masy dla tej jednostki.')
    }
    const quantity = numeric(requestedQuantity)
    if (quantity === null || quantity < 0) return failure('Nie można przeliczyć receptury: nieprawidłowa ilość do przygotowania.')
    const requestedBaseQuantity = quantity * multiplier
    requestedGrams = massQuantity ? requestedBaseQuantity : null
    factor = requestedBaseQuantity / base
    if (!Number.isFinite(requestedBaseQuantity) || !Number.isFinite(factor) ||
      (quantity > 0 && (requestedBaseQuantity === 0 || factor === 0))) {
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
