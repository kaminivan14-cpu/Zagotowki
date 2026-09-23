import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { calculateRequirements, createRequirementsRecipeLoader } from '../productionRequirements'
import { employeeCanViewPlan, managementRoles } from '../planAccess'

const formatQuantity = (value) => value > 0 && value < 0.001
  ? '< 0,001' : new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 3 }).format(value)

export default function RequirementsScreen({ planId, pracownik, wybranyLokal, onBack }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    async function read() {
      const { data: plan, error: planError } = await supabase.from('Plans')
        .select('id, location_id, plan_date, status').eq('id', planId).single()
      if (planError) throw planError
      const allowed = pracownik.role === 'employee' ? employeeCanViewPlan(pracownik, plan)
        : managementRoles.includes(pracownik.role) && (pracownik.role === 'administrator' ||
          (pracownik.location_id != null && String(pracownik.location_id) === String(plan.location_id)))
      if (!allowed || String(plan.location_id) !== String(wybranyLokal.id)) {
        throw new Error('Plan nie jest dostępny w tym lokalu lub dla tego pracownika.')
      }
      const items = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error: itemError } = await supabase.from('Plan_items')
          .select('id, nazwa, product_external_id, ilosc, jednostka')
          .eq('plan_id', planId).order('id').range(offset, offset + 999)
        if (itemError) throw itemError
        items.push(...data)
        if (data.length < 1000) break
      }
      const calculated = await calculateRequirements(items, createRequirementsRecipeLoader())
      if (active) setResult({ ...calculated, plan, count: items.length })
    }
    read().catch((failure) => {
      if (active) setError(failure.message || 'Nie udało się pobrać zapotrzebowania. Sprawdź połączenie.')
    })
    return () => { active = false }
  }, [planId, pracownik, wybranyLokal, attempt])

  return <div className="app">
    <header><h1>Zapotrzebowanie ogólne</h1><p>{wybranyLokal.name}</p></header>
    <main>
      <button className="powrot" onClick={onBack}>← Powrót do planu</button>
      <button className="powrot" onClick={() => {
        setResult(null); setError(''); setAttempt((value) => value + 1)
      }} disabled={!result && !error}>Odśwież zapotrzebowanie</button>
      {error && <p role="alert">{error}</p>}
      {!error && !result && <p role="status">Obliczanie zapotrzebowania…</p>}
      {result && <>
        <p>Plan: {result.plan.plan_date} · {result.count} pozycji</p>
        <p>Brutto dla wszystkich pozycji planu, również zakończonych. Różne jednostki pokazujemy osobno.</p>
        {result.warnings.length > 0 && <section className="produkt" aria-label="Ostrzeżenia">
          <h2>Niepełne zapotrzebowanie</h2>
          <p>Poniższe sumy obejmują tylko poprawnie obliczone gałęzie. Nie używaj ich jako pełnej listy zapotrzebowania.</p>
          <ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </section>}
        {result.count === 0 ? <p>Plan nie ma pozycji.</p> : result.totals.length === 0
          ? <p>Brak składników, które można bezpiecznie zsumować.</p>
          : <ul className="requirements-list">{result.totals.map((row) =>
            <li className="produkt" key={JSON.stringify([row.id, row.unit])}>
              <div><strong>{row.name}</strong><small>ID składnika: {row.id}</small></div>
              <span>{formatQuantity(row.quantity)} {row.unit}</span>
            </li>)}
          </ul>}
      </>}
    </main>
  </div>
}
