import { useEffect, useId, useState } from 'react'
import { loadRecipe } from '../recipeCache'
import { scaleRecipe } from '../recipeScaling'
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

function IngredientRecipe({ externalId, name, path, requestedGrams }) {
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
  if (!data.product || data.ingredients.length === 0) return null

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
        <div id={contentId} className="recipe-nested">
          <RecipeContent data={data} path={[...path, String(externalId)]} requestedQuantity={requestedGrams} unit="g" nested />
        </div>
      )}
    </div>
  )
}

function displayGrams(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const number = Number(value)
  if (number > 0 && number < 0.001) return '< 0,001 g'
  return `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 3 }).format(number)} g`
}

function RecipeContent({ data, path, requestedQuantity, unit, nested = false }) {
  const scaled = scaleRecipe(data.product, data.ingredients, requestedQuantity, unit)
  const Heading = nested ? 'h4' : 'h3'
  return (
    <section className="recipe-content">
      <div className="recipe-heading">
        <Heading>{data.product.name ?? '—'}</Heading>
        <p>Gramatura bazowa: <strong>{displayGrams(data.product.gramatura)}</strong></p>
        {!scaled.error && <p>Do przygotowania: <strong>{displayGrams(scaled.requestedGrams)}</strong></p>}
      </div>
      {scaled.error && data.ingredients.length > 0 && <p className="recipe-message" role="status">{scaled.error}</p>}
      {data.ingredients.length === 0 ? (
        <p role="status">Brak składników receptury dla tego produktu.</p>
      ) : (
        <ul className="recipe-ingredients">
          {data.ingredients.map((ingredient, index) => {
            const calculated = scaled.ingredients[index]
            const cycle = ingredient.ingredient_external_id != null &&
              path.includes(String(ingredient.ingredient_external_id))
            return (
              <li key={`${index}:${ingredient.ingredient_external_id ?? 'none'}`}>
                <div className="recipe-ingredient-values">
                  <strong>{ingredient.ingredient_name ?? '—'}</strong>
                  <dl>
                    <div><dt>Netto bazowe</dt><dd>{displayGrams(ingredient.netto)}</dd></div>
                    <div><dt>Brutto bazowe</dt><dd>{displayGrams(ingredient.brutto)}</dd></div>
                    <div className="recipe-required"><dt>Potrzebne brutto</dt><dd>{displayGrams(calculated?.requiredGross)}</dd></div>
                  </dl>
                </div>
                {calculated?.error && <p className="recipe-message" role="status">{calculated.error}</p>}
                {cycle ? (
                  <p className="recipe-message" role="status">Nie można rozwinąć składnika: cykl w recepturze.</p>
                ) : ingredient.ingredient_external_id != null && (
                  <IngredientRecipe
                    externalId={ingredient.ingredient_external_id}
                    name={ingredient.ingredient_name}
                    path={path}
                    requestedGrams={calculated?.requiredGross ?? null}
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
