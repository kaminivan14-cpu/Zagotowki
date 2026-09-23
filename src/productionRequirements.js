import { supabase } from './supabase'
import { scaleRecipe, extendRecipePath, normalizeRecipeUnit } from './recipeScaling'

// A fresh cache per screen load: current recipes, shared reads within this calculation.
export function createRequirementsRecipeLoader() {
  const cache = new Map()
  let unitColumnAvailable = true
  let baseUnitColumnAvailable = true
  return function load(externalId) {
    const key = String(externalId)
    if (!cache.has(key)) cache.set(key, (async () => {
      const readProduct = (withUnit) => supabase.from('Products')
        .select(`external_id, name, gramatura${withUnit ? ', base_unit' : ''}`)
        .eq('external_id', externalId).maybeSingle()
      let productResult = await readProduct(baseUnitColumnAvailable)
      if (baseUnitColumnAvailable && ['42703', 'PGRST204'].includes(productResult.error?.code)) {
        baseUnitColumnAvailable = false
        productResult = await readProduct(false)
      }
      if (productResult.error) throw productResult.error
      const product = productResult.data
      const ingredients = []
      for (let offset = 0; ; offset += 1000) {
        const read = (withUnit) => supabase.from('Recipe_ingredients')
          .select(`id, ingredient_external_id, ingredient_name, brutto${withUnit ? ', ingredient_unit' : ''}`)
          .eq('product_external_id', externalId).order('id').range(offset, offset + 999)
        let result = await read(unitColumnAvailable)
        // The screen also works before the optional unit migration is installed.
        if (unitColumnAvailable && ['42703', 'PGRST204'].includes(result.error?.code)) {
          unitColumnAvailable = false
          result = await read(false)
        }
        if (result.error) throw result.error
        ingredients.push(...result.data)
        if (result.data.length < 1000) break
      }
      return { product, ingredients }
    })())
    return cache.get(key)
  }
}

const validId = (id) => (typeof id === 'number' && Number.isSafeInteger(id)) ||
  (typeof id === 'string' && /^\d+$/.test(id))

export async function calculateRequirements(items, load) {
  const totals = new Map()
  const warnings = []
  const warn = (path, message) => warnings.push(`${path}: ${message}`)

  async function walk(scaled, path, label) {
    if (scaled.error) { warn(label, scaled.error); return }
    for (const ingredient of scaled.ingredients) {
      const id = ingredient.ingredient_external_id
      const name = ingredient.ingredient_name || `Składnik ${id ?? 'bez ID'}`
      const branch = `${label} → ${name}`
      if (ingredient.error) { warn(branch, ingredient.error); continue }
      if (!validId(id)) { warn(branch, 'Brak bezpiecznego ID składnika; pominięto.'); continue }
      const unit = normalizeRecipeUnit(ingredient.ingredient_unit)
      if (!unit) {
        warn(branch, 'Brak lub nieobsługiwana jednostka brutto w recepturze źródłowej (dozwolone: g, ml, szt.); pominięto gałąź.')
        continue
      }
      const childPath = extendRecipePath(path, id)
      if (!childPath) { warn(branch, 'Cykl receptury; pominięto gałąź.'); continue }
      let child
      try { child = await load(id) } catch {
        warn(branch, 'Nie udało się pobrać receptury; nie można ustalić składników końcowych.')
        continue
      }
      if (child.product) {
        const childUnit = normalizeRecipeUnit(child.product.base_unit)
        if (!childUnit) {
          warn(branch, 'Brak lub nieobsługiwana jednostka bazowa półproduktu; pominięto gałąź.')
          continue
        }
        if (unit !== childUnit) {
          warn(branch, `Jednostka brutto (${unit}) nie zgadza się z jednostką bazową półproduktu (${childUnit}); brak przelicznika, pominięto gałąź.`)
          continue
        }
        // Match TechnologyCard: every level retains the root factor.
        await walk(scaleRecipe(child.product, child.ingredients,
          ingredient.requiredGross, undefined, scaled.factor), childPath, branch)
        continue
      }
      if (child.ingredients.length) {
        warn(branch, 'Receptura bez produktu w katalogu; pominięto gałąź.')
        continue
      }
      // Never infer conversions or merge names. Different units stay separate.
      const key = JSON.stringify([String(id), unit])
      const total = totals.get(key) || { id: String(id), name, unit, quantity: 0 }
      const sum = total.quantity === null ? null : total.quantity + ingredient.requiredGross
      if (sum !== null && !Number.isFinite(sum)) {
        warn(branch, 'Suma poza zakresem obliczeń; pominięto sumę dla tego ID i jednostki.')
        total.quantity = null
      } else total.quantity = sum
      totals.set(key, total)
    }
  }

  for (const item of items) {
    const label = `${item.nazwa || 'Produkt'} (pozycja ${item.id})`
    if (!validId(item.product_external_id)) {
      warn(label, 'Brak bezpiecznego ID produktu; pominięto pozycję.')
      continue
    }
    try {
      const data = await load(item.product_external_id)
      await walk(scaleRecipe(data.product, data.ingredients, item.ilosc, item.jednostka,
        undefined, data.product?.base_unit ?? null),
        [String(item.product_external_id)], label)
    } catch {
      warn(label, 'Nie udało się pobrać receptury; pominięto pozycję.')
    }
  }
  return {
    totals: [...totals.values()].filter((row) => row.quantity !== null)
      .sort((a, b) => a.name.localeCompare(b.name, 'pl') || a.unit.localeCompare(b.unit)),
    warnings,
  }
}
