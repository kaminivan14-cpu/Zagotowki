import { useEffect, useId, useState } from 'react'
import { loadRecipe } from '../recipeCache'
import { scaleRecipe, extendRecipePath } from '../recipeScaling'
import './TechnologyCard.css'

function useRecipe(externalId) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    loadRecipe(externalId).then((data) => {
      if (active) setResult({ externalId, data })
    }).catch(() => {
      if (active) setResult({ externalId, error: true })
    })
    return () => { active = false }
  }, [externalId, attempt])

  return {
    ...(result?.externalId === externalId ? result : null),
    retry: () => {
      setResult(null)
      setAttempt((value) => value + 1)
    },
  }
}

function IngredientRecipe({ externalId, name, path, requiredQuantity, rootScaleFactor }) {
  const { data, error, retry } = useRecipe(externalId)
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()

  if (error) return (
    <div className="recipe-message" role="alert">
      <p>Nie udało się sprawdzić receptury składnika.</p>
      <button type="button" className="powrot" onClick={retry}>Spróbuj ponownie</button>
    </div>
  )
  if (!data) return <p className="recipe-message" role="status">Sprawdzanie receptury składnika…</p>
  if (!data.product) return (
    <p className="recipe-message">Brak osobnej receptury w katalogu dla tego składnika.</p>
  )
  if (data.ingredients.length === 0) return (
    <p className="recipe-message" role="status">Brak składników receptury półproduktu.</p>
  )
  if (rootScaleFactor == null) return (
    <p className="recipe-message" role="status">Nie można przeliczyć kolejnego poziomu: brak poprawnego współczynnika produktu głównego.</p>
  )

  return (
    <div className="recipe-branch">
      <button
        type="button"
        className="recipe-expand"
        aria-label={`${expanded ? 'Zwiń' : 'Rozwiń'} recepturę: ${name ?? '—'}`}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? '−' : '+'} Półprodukt · {expanded ? 'Zwiń recepturę' : 'Rozwiń recepturę'}
      </button>
      {expanded && (
        <div id={contentId} className="recipe-nested" role="region" aria-label={`Receptura półproduktu: ${name ?? '—'}`}>
          <RecipeContent data={data} path={path} requestedQuantity={requiredQuantity} rootScaleFactor={rootScaleFactor} nested />
        </div>
      )}
    </div>
  )
}

function displayQuantity(value, unit = '') {
  if (value == null || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) return '—'
  const number = Number(value)
  const suffix = unit ? ` ${unit}` : ''
  if (number > 0 && number < 0.001) return `< 0,001${suffix}`
  return `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 3 }).format(number)}${suffix}`
}

function RecipeContent({ data, path, requestedQuantity, unit, rootScaleFactor, nested = false }) {
  const scaled = scaleRecipe(data.product, data.ingredients, requestedQuantity, unit, rootScaleFactor)
  const Heading = nested ? 'h4' : 'h3'
  return (
    <section className="recipe-content">
      {nested && <p className="recipe-depth">Poziom {path.length} · Receptura półproduktu</p>}
      <div className="recipe-heading">
        <Heading>{data.product.name ?? '—'}</Heading>
        <p>Gramatura bazowa: <strong>{displayQuantity(data.product.gramatura, 'g')}</strong></p>
        {!scaled.error && <p>Do przygotowania: <strong>{nested ? displayQuantity(requestedQuantity) : displayQuantity(scaled.requestedGrams, 'g')}</strong></p>}
      </div>
      <p className="recipe-message">Ilości składników podano w jednostkach receptury źródłowej.</p>
      {scaled.error && data.ingredients.length > 0 && <p className="recipe-message" role="status">{scaled.error}</p>}
      {data.ingredients.length === 0 ? (
        <p role="status">Brak składników receptury dla tego produktu.</p>
      ) : (
        <ul className="recipe-ingredients">
          {data.ingredients.map((ingredient, index) => {
            const calculated = scaled.ingredients[index]
            const childPath = extendRecipePath(path, ingredient.ingredient_external_id)
            const cycle = ingredient.ingredient_external_id != null && childPath === null
            return (
              <li key={`${index}:${ingredient.ingredient_external_id ?? 'none'}`}>
                <div className="recipe-ingredient-values">
                  <strong>{ingredient.ingredient_name ?? '—'}</strong>
                  <dl>
                    <div><dt>Netto bazowe</dt><dd>{displayQuantity(ingredient.netto)}</dd></div>
                    <div><dt>Brutto bazowe</dt><dd>{displayQuantity(ingredient.brutto)}</dd></div>
                    <div className="recipe-required"><dt>Potrzebne brutto</dt><dd>{displayQuantity(calculated?.requiredGross)}</dd></div>
                  </dl>
                </div>
                {calculated?.error && <p className="recipe-message" role="status">{calculated.error}</p>}
                {cycle ? (
                  <p className="recipe-message" role="status">Wykryto cykliczne powiązanie receptury. Rozwijanie tej gałęzi zostało zatrzymane.</p>
                ) : ingredient.ingredient_external_id != null && (
                  <IngredientRecipe
                    externalId={ingredient.ingredient_external_id}
                    name={ingredient.ingredient_name}
                    path={childPath}
                    requiredQuantity={calculated?.requiredGross ?? null}
                    rootScaleFactor={scaled.factor}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default function TechnologyCard({ externalId, requestedQuantity, unit, id, onClose }) {
  const { data, error, retry } = useRecipe(externalId)
  return (
    <section className="produkt technology-card" id={id} aria-label="Karta technologiczna">
      <div className="technology-card-heading">
        <h2>Karta technologiczna</h2>
        <button type="button" className="powrot" onClick={onClose}>Zamknij kartę</button>
      </div>
      {error ? (
        <div role="alert">
          <p>Nie udało się pobrać karty technologicznej.</p>
          <button type="button" className="powrot" onClick={retry}>Spróbuj ponownie</button>
        </div>
      ) : !data ? (
        <p role="status">Ładowanie karty technologicznej…</p>
      ) : !data.product ? (
        <p role="status">Nie znaleziono produktu w katalogu.</p>
      ) : (
        <RecipeContent data={data} path={[String(externalId)]} requestedQuantity={requestedQuantity} unit={unit} />
      )}
    </section>
  )
}
