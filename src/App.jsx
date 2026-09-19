import { useEffect, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

const produktyStartowe = [
  { id: 1, nazwa: 'Ryż', domyslnaJednostka: 'kg' },
  { id: 2, nazwa: 'Łosoś', domyslnaJednostka: 'kg' },
  { id: 3, nazwa: 'Sos Spicy', domyslnaJednostka: 'l' },
  { id: 4, nazwa: 'Tempura', domyslnaJednostka: 'kg' },
]

const jednostki = ['g', 'kg', 'ml', 'l', 'szt.']

function App() {
  const [ekran, setEkran] = useState('planowanie')
  const [wybrane, setWybrane] = useState({})
  const [plan, setPlan] = useState([])
  const [planId, setPlanId] = useState(null)
  const [ladowanie, setLadowanie] = useState(true)
  const [zapisywanie, setZapisywanie] = useState(false)

  // Przy uruchomieniu aplikacji pobieramy aktywny plan z Supabase
  useEffect(() => {
    pobierzPlan()
  }, [])

  const pobierzPlan = async () => {
    setLadowanie(true)

    try {
      // Pobieramy najnowszy aktywny plan
      const { data: plans, error: planError } = await supabase
        .from('Plans')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)

      if (planError) throw planError

      // Nie ma aktywnego planu
      if (!plans || plans.length === 0) {
        setPlan([])
        setPlanId(null)
        setEkran('planowanie')
        return
      }

      const aktywnyPlan = plans[0]

      // Pobieramy pozycje należące do planu
      const { data: items, error: itemsError } = await supabase
        .from('Plan_items')
        .select('*')
        .eq('plan_id', aktywnyPlan.id)
        .order('id', { ascending: true })

      if (itemsError) throw itemsError

      setPlanId(aktywnyPlan.id)
      setPlan(items || [])
      setEkran('produkcja')
    } catch (error) {
      console.error('Błąd pobierania planu:', error)
      alert(`Nie udało się pobrać planu: ${error.message}`)
    } finally {
      setLadowanie(false)
    }
  }

  const zmienProdukt = (id, pole, wartosc) => {
    setWybrane((poprzednie) => ({
      ...poprzednie,
      [id]: {
        ...poprzednie[id],
        [pole]: wartosc,
      },
    }))
  }

  const zatwierdzPlan = async () => {
    const nowyPlan = produktyStartowe
      .filter((produkt) => wybrane[produkt.id]?.aktywny)
      .map((produkt) => ({
        nazwa: produkt.nazwa,
        ilosc: Number(wybrane[produkt.id]?.ilosc),
        jednostka:
          wybrane[produkt.id]?.jednostka ||
          produkt.domyslnaJednostka,
        priorytet:
          wybrane[produkt.id]?.priorytet ||
          'normalny',
        gotowe: false,
      }))

    if (nowyPlan.length === 0) {
      alert('Wybierz przynajmniej jeden produkt.')
      return
    }

    const brakIlosci = nowyPlan.some(
      (produkt) =>
        !produkt.ilosc ||
        produkt.ilosc <= 0
    )

    if (brakIlosci) {
      alert('Wpisz poprawną ilość dla każdego produktu.')
      return
    }

    setZapisywanie(true)

    try {
      let aktualnyPlanId = planId

      // Jeżeli tworzymy nowy plan
      if (!aktualnyPlanId) {
        const jutro = new Date()
        jutro.setDate(jutro.getDate() + 1)

        const planDate = [
          jutro.getFullYear(),
          String(jutro.getMonth() + 1).padStart(2, '0'),
          String(jutro.getDate()).padStart(2, '0'),
        ].join('-')

        const { data: utworzonyPlan, error: planError } =
          await supabase
            .from('Plans')
            .insert({
              plan_date: planDate,
              status: 'active',
            })
            .select()
            .single()

        if (planError) throw planError

        aktualnyPlanId = utworzonyPlan.id
      } else {
        // Edytujemy istniejący plan:
        // usuwamy stare pozycje i zapisujemy aktualny zestaw.
        const { error: deleteError } = await supabase
          .from('Plan_items')
          .delete()
          .eq('plan_id', aktualnyPlanId)

        if (deleteError) throw deleteError
      }

      const pozycjeDoZapisu = nowyPlan.map((produkt) => ({
        plan_id: aktualnyPlanId,
        nazwa: produkt.nazwa,
        ilosc: produkt.ilosc,
        jednostka: produkt.jednostka,
        priorytet: produkt.priorytet,
        gotowe: false,
      }))

      const { data: zapisanePozycje, error: itemsError } =
        await supabase
          .from('Plan_items')
          .insert(pozycjeDoZapisu)
          .select()

      if (itemsError) throw itemsError

      setPlanId(aktualnyPlanId)
      setPlan(zapisanePozycje)
      setEkran('produkcja')
    } catch (error) {
      console.error('Błąd zapisu planu:', error)
      alert(`Nie udało się zapisać planu: ${error.message}`)
    } finally {
      setZapisywanie(false)
    }
  }

  const oznaczGotowe = async (id) => {
    const produkt = plan.find(
      (element) => element.id === id
    )

    if (!produkt) return

    const nowyStatus = !produkt.gotowe

    // Aktualizujemy ekran od razu
    setPlan((poprzedniPlan) =>
      poprzedniPlan.map((element) =>
        element.id === id
          ? { ...element, gotowe: nowyStatus }
          : element
      )
    )

    const { error } = await supabase
      .from('Plan_items')
      .update({ gotowe: nowyStatus })
      .eq('id', id)

    if (error) {
      // Jeśli zapis się nie udał, cofamy zmianę na ekranie
      setPlan((poprzedniPlan) =>
        poprzedniPlan.map((element) =>
          element.id === id
            ? { ...element, gotowe: produkt.gotowe }
            : element
        )
      )

      console.error('Błąd aktualizacji:', error)
      alert(`Nie udało się zapisać zmiany: ${error.message}`)
    }
  }

  const edytujPlan = () => {
    const daneDoEdycji = {}

    plan.forEach((produkt) => {
      const produktStartowy = produktyStartowe.find(
        (element) => element.nazwa === produkt.nazwa
      )

      if (!produktStartowy) return

      daneDoEdycji[produktStartowy.id] = {
        aktywny: true,
        ilosc: produkt.ilosc,
        jednostka: produkt.jednostka,
        priorytet: produkt.priorytet,
      }
    })

    setWybrane(daneDoEdycji)
    setEkran('planowanie')
  }

  const zakonczPlan = async () => {
    const potwierdzenie = window.confirm(
      'Czy na pewno zakończyć dzisiejszy plan produkcji?'
    )

    if (!potwierdzenie || !planId) return

    const { error } = await supabase
      .from('Plans')
      .update({ status: 'completed' })
      .eq('id', planId)

    if (error) {
      console.error('Błąd zakończenia planu:', error)
      alert(`Nie udało się zakończyć planu: ${error.message}`)
      return
    }

    setPlan([])
    setPlanId(null)
    setWybrane({})
    setEkran('planowanie')
  }

  if (ladowanie) {
    return (
      <div className="app">
        <header>
          <h1>ZAGOTÓWKI</h1>
          <p>Ładowanie planu...</p>
        </header>
      </div>
    )
  }

  if (ekran === 'produkcja') {
    const pozostalo = plan.filter(
      (produkt) => !produkt.gotowe
    ).length

    return (
      <div className="app">
        <header>
          <h1>ZAGOTÓWKI</h1>
          <p>Produkcja na dziś</p>
        </header>

        <main>
          <div className="naglowek-produkcji">
            <div>
              <h2>Do zrobienia</h2>

              <p className="licznik">
                Pozostało: <strong>{pozostalo}</strong>
              </p>
            </div>

            <button
              className="powrot"
              onClick={edytujPlan}
            >
              ← Edytuj plan
            </button>
          </div>

          <div className="produkty">
            {plan.map((produkt) => (
              <div
                key={produkt.id}
                className={`produkt zadanie ${
                  produkt.gotowe ? 'gotowe' : ''
                }`}
              >
                <div className="opis-zadania">
                  <strong>{produkt.nazwa}</strong>

                  <span className="ilosc-produkcja">
                    {produkt.ilosc} {produkt.jednostka}
                  </span>

                  <span
                    className={`priorytet ${produkt.priorytet}`}
                  >
                    {produkt.priorytet === 'pilny'
                      ? 'Pilny'
                      : produkt.priorytet === 'wysoki'
                        ? 'Wysoki'
                        : 'Normalny'}
                  </span>
                </div>

                <button
                  className="gotowe-button"
                  onClick={() =>
                    oznaczGotowe(produkt.id)
                  }
                >
                  {produkt.gotowe
                    ? '↩ Cofnij'
                    : '✓ Gotowe'}
                </button>
              </div>
            ))}
          </div>

          {pozostalo === 0 && (
            <div className="wszystko-gotowe">
              ✓ Wszystko gotowe
            </div>
          )}

          <button
            className="zakoncz-plan"
            onClick={zakonczPlan}
          >
            Zakończ plan
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header>
        <h1>ZAGOTÓWKI</h1>
        <p>Plan produkcji na jutro</p>
      </header>

      <main>
        <h2>Co przygotować?</h2>

        <div className="produkty">
          {produktyStartowe.map((produkt) => (
            <div
              className="produkt"
              key={produkt.id}
            >
              <label>
                <input
                  type="checkbox"
                  checked={
                    wybrane[produkt.id]?.aktywny ||
                    false
                  }
                  onChange={(e) =>
                    zmienProdukt(
                      produkt.id,
                      'aktywny',
                      e.target.checked
                    )
                  }
                />

                <strong>{produkt.nazwa}</strong>
              </label>

              {wybrane[produkt.id]?.aktywny && (
                <div className="ustawienia">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="Ilość"
                    value={
                      wybrane[produkt.id]?.ilosc ||
                      ''
                    }
                    onChange={(e) =>
                      zmienProdukt(
                        produkt.id,
                        'ilosc',
                        e.target.value
                      )
                    }
                  />

                  <select
                    value={
                      wybrane[produkt.id]?.jednostka ||
                      produkt.domyslnaJednostka
                    }
                    onChange={(e) =>
                      zmienProdukt(
                        produkt.id,
                        'jednostka',
                        e.target.value
                      )
                    }
                  >
                    {jednostki.map((jednostka) => (
                      <option
                        key={jednostka}
                        value={jednostka}
                      >
                        {jednostka}
                      </option>
                    ))}
                  </select>

                  <select
                    value={
                      wybrane[produkt.id]?.priorytet ||
                      'normalny'
                    }
                    onChange={(e) =>
                      zmienProdukt(
                        produkt.id,
                        'priorytet',
                        e.target.value
                      )
                    }
                  >
                    <option value="normalny">
                      Normalny
                    </option>

                    <option value="wysoki">
                      Wysoki
                    </option>

                    <option value="pilny">
                      Pilny
                    </option>
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          className="zatwierdz"
          onClick={zatwierdzPlan}
          disabled={zapisywanie}
        >
          {zapisywanie
            ? 'Zapisywanie...'
            : 'Zatwierdź plan'}
        </button>
      </main>
    </div>
  )
}

export default App