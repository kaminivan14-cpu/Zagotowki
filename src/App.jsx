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
  const [ekran, setEkran] = useState('wybor-lokalu')

  const [lokale, setLokale] = useState([])
  const [wybranyLokal, setWybranyLokal] = useState(null)

  const [wybrane, setWybrane] = useState({})
  const [plan, setPlan] = useState([])
  const [planId, setPlanId] = useState(null)

  const [ladowanie, setLadowanie] = useState(true)
  const [zapisywanie, setZapisywanie] = useState(false)

  // -----------------------------------------
  // START APLIKACJI - POBIERAMY LOKALE
  // -----------------------------------------

  useEffect(() => {
    pobierzLokale()
  }, [])
useEffect(() => {
  if (!planId) return

  const channel = supabase
    .channel(`plan-items-${planId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'Plan_items',
        filter: `plan_id=eq.${planId}`,
      },
      async () => {
        const { data, error } = await supabase
          .from('Plan_items')
          .select('*')
          .eq('plan_id', planId)
          .order('id', { ascending: true })

        if (error) {
          console.error('Błąd Realtime:', error)
          return
        }

        setPlan(data || [])
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [planId])

  const pobierzLokale = async () => {
    setLadowanie(true)

    try {
      const { data, error } = await supabase
        .from('Locations')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })

      if (error) throw error

      setLokale(data || [])
    } catch (error) {
      console.error('Błąd pobierania lokali:', error)

      alert(
        `Nie udało się pobrać lokali: ${error.message}`
      )
    } finally {
      setLadowanie(false)
    }
  }

  // -----------------------------------------
  // WYBÓR LOKALU
  // -----------------------------------------

  const wybierzLokal = async (lokal) => {
    setWybranyLokal(lokal)

    setPlan([])
    setPlanId(null)
    setWybrane({})

    await pobierzPlan(lokal.id)
  }

  // -----------------------------------------
  // POBIERANIE PLANU DLA KONKRETNEGO LOKALU
  // -----------------------------------------

  const pobierzPlan = async (locationId) => {
    setLadowanie(true)

    try {
      const { data: plans, error: planError } =
        await supabase
          .from('Plans')
          .select('*')
          .eq('status', 'active')
          .eq('location_id', locationId)
          .order('created_at', { ascending: false })
          .limit(1)

      if (planError) throw planError

      // Lokal nie ma jeszcze aktywnego planu
      if (!plans || plans.length === 0) {
        setPlan([])
        setPlanId(null)
        setWybrane({})
        setEkran('planowanie')
        return
      }

      const aktywnyPlan = plans[0]

      const { data: items, error: itemsError } =
        await supabase
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

      alert(
        `Nie udało się pobrać planu: ${error.message}`
      )

      setEkran('wybor-lokalu')
    } finally {
      setLadowanie(false)
    }
  }

  // -----------------------------------------
  // ZMIANA PRODUKTU
  // -----------------------------------------

  const zmienProdukt = (id, pole, wartosc) => {
    setWybrane((poprzednie) => ({
      ...poprzednie,

      [id]: {
        ...poprzednie[id],
        [pole]: wartosc,
      },
    }))
  }

  // -----------------------------------------
  // ZAPIS PLANU
  // -----------------------------------------

  const zatwierdzPlan = async () => {
    if (!wybranyLokal) {
      alert('Najpierw wybierz lokal.')
      return
    }

    const nowyPlan = produktyStartowe
      .filter(
        (produkt) =>
          wybrane[produkt.id]?.aktywny
      )
      .map((produkt) => ({
        nazwa: produkt.nazwa,

        ilosc: Number(
          wybrane[produkt.id]?.ilosc
        ),

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
      alert(
        'Wpisz poprawną ilość dla każdego produktu.'
      )
      return
    }

    setZapisywanie(true)

    try {
      let aktualnyPlanId = planId

      // -------------------------------------
      // TWORZENIE NOWEGO PLANU
      // -------------------------------------

      if (!aktualnyPlanId) {
        const jutro = new Date()

        jutro.setDate(
          jutro.getDate() + 1
        )

        const planDate = [
          jutro.getFullYear(),

          String(
            jutro.getMonth() + 1
          ).padStart(2, '0'),

          String(
            jutro.getDate()
          ).padStart(2, '0'),
        ].join('-')

        const {
          data: utworzonyPlan,
          error: planError,
        } = await supabase
          .from('Plans')
          .insert({
            plan_date: planDate,
            status: 'active',

            // NAJWAŻNIEJSZE:
            // plan należy do konkretnego lokalu
            location_id: wybranyLokal.id,
          })
          .select()
          .single()

        if (planError) throw planError

        aktualnyPlanId =
          utworzonyPlan.id
      } else {
        // -----------------------------------
        // EDYCJA ISTNIEJĄCEGO PLANU
        // -----------------------------------

        const { error: deleteError } =
          await supabase
            .from('Plan_items')
            .delete()
            .eq(
              'plan_id',
              aktualnyPlanId
            )

        if (deleteError)
          throw deleteError
      }

      // -------------------------------------
      // ZAPIS POZYCJI PLANU
      // -------------------------------------

      const pozycjeDoZapisu =
        nowyPlan.map((produkt) => ({
          plan_id: aktualnyPlanId,
          nazwa: produkt.nazwa,
          ilosc: produkt.ilosc,
          jednostka:
            produkt.jednostka,
          priorytet:
            produkt.priorytet,
          gotowe: false,
        }))

      const {
        data: zapisanePozycje,
        error: itemsError,
      } = await supabase
        .from('Plan_items')
        .insert(pozycjeDoZapisu)
        .select()

      if (itemsError) throw itemsError

      setPlanId(aktualnyPlanId)
      setPlan(zapisanePozycje || [])
      setEkran('produkcja')
    } catch (error) {
      console.error(
        'Błąd zapisu planu:',
        error
      )

      alert(
        `Nie udało się zapisać planu: ${error.message}`
      )
    } finally {
      setZapisywanie(false)
    }
  }

  // -----------------------------------------
  // GOTOWE / COFNIJ
  // -----------------------------------------

  const oznaczGotowe = async (id) => {
    const produkt = plan.find(
      (element) => element.id === id
    )

    if (!produkt) return

    const nowyStatus =
      !produkt.gotowe

    // Aktualizacja ekranu od razu
    setPlan((poprzedniPlan) =>
      poprzedniPlan.map((element) =>
        element.id === id
          ? {
              ...element,
              gotowe: nowyStatus,
            }
          : element
      )
    )

    const { error } = await supabase
      .from('Plan_items')
      .update({
        gotowe: nowyStatus,
      })
      .eq('id', id)

    if (error) {
      // Cofamy zmianę jeśli Supabase zwróci błąd
      setPlan((poprzedniPlan) =>
        poprzedniPlan.map((element) =>
          element.id === id
            ? {
                ...element,
                gotowe:
                  produkt.gotowe,
              }
            : element
        )
      )

      console.error(
        'Błąd aktualizacji:',
        error
      )

      alert(
        `Nie udało się zapisać zmiany: ${error.message}`
      )
    }
  }

  // -----------------------------------------
  // EDYCJA PLANU
  // -----------------------------------------

  const edytujPlan = () => {
    const daneDoEdycji = {}

    plan.forEach((produkt) => {
      const produktStartowy =
        produktyStartowe.find(
          (element) =>
            element.nazwa ===
            produkt.nazwa
        )

      if (!produktStartowy) return

      daneDoEdycji[
        produktStartowy.id
      ] = {
        aktywny: true,
        ilosc: produkt.ilosc,
        jednostka:
          produkt.jednostka,
        priorytet:
          produkt.priorytet,
      }
    })

    setWybrane(daneDoEdycji)
    setEkran('planowanie')
  }

  // -----------------------------------------
  // ZAKOŃCZENIE PLANU
  // -----------------------------------------

  const zakonczPlan = async () => {
    const potwierdzenie =
      window.confirm(
        'Czy na pewno zakończyć dzisiejszy plan produkcji?'
      )

    if (
      !potwierdzenie ||
      !planId
    ) {
      return
    }

    const { error } = await supabase
      .from('Plans')
      .update({
        status: 'completed',
      })
      .eq('id', planId)

    if (error) {
      console.error(
        'Błąd zakończenia planu:',
        error
      )

      alert(
        `Nie udało się zakończyć planu: ${error.message}`
      )

      return
    }

    setPlan([])
    setPlanId(null)
    setWybrane({})
    setEkran('planowanie')
  }

  // -----------------------------------------
  // ZMIANA LOKALU
  // -----------------------------------------

  const zmienLokal = () => {
    setWybranyLokal(null)
    setPlan([])
    setPlanId(null)
    setWybrane({})
    setEkran('wybor-lokalu')
  }

  // -----------------------------------------
  // ŁADOWANIE
  // -----------------------------------------

  if (ladowanie) {
    return (
      <div className="app">
        <header>
          <h1>ZAGOTÓWKI</h1>
          <p>Ładowanie...</p>
        </header>
      </div>
    )
  }

  // -----------------------------------------
  // EKRAN WYBORU LOKALU
  // -----------------------------------------

  if (ekran === 'wybor-lokalu') {
    return (
      <div className="app">
        <header>
          <h1>ZAGOTÓWKI</h1>
          <p>Wybierz lokal</p>
        </header>

        <main>
          <h2>Gdzie pracujesz?</h2>

          <div className="produkty">
            {lokale.map((lokal) => (
              <button
                key={lokal.id}
                className="produkt"
                onClick={() =>
                  wybierzLokal(lokal)
                }
                style={{
                  width: '100%',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <strong>
                  {lokal.name}
                </strong>

                {lokal.city && (
                  <span
                    style={{
                      marginLeft: '10px',
                    }}
                  >
                    {lokal.city}
                  </span>
                )}
              </button>
            ))}
          </div>

          {lokale.length === 0 && (
            <p>
              Brak aktywnych lokali.
            </p>
          )}
        </main>
      </div>
    )
  }

  // -----------------------------------------
  // EKRAN PRODUKCJI
  // -----------------------------------------

  if (ekran === 'produkcja') {
    const pozostalo = plan.filter(
      (produkt) => !produkt.gotowe
    ).length

    return (
      <div className="app">
        <header>
          <h1>ZAGOTÓWKI</h1>

          <p>
            {wybranyLokal?.name}
          </p>
        </header>

        <main>
          <div className="naglowek-produkcji">
            <div>
              <h2>Do zrobienia</h2>

              <p className="licznik">
                Pozostało:{' '}
                <strong>
                  {pozostalo}
                </strong>
              </p>
            </div>

            <button
              className="powrot"
              onClick={edytujPlan}
            >
              ← Edytuj plan
            </button>
          </div>

          <button
            className="powrot"
            onClick={zmienLokal}
            style={{
              marginBottom: '20px',
            }}
          >
            📍 Zmień lokal
          </button>

          <div className="produkty">
            {plan.map((produkt) => (
              <div
                key={produkt.id}
                className={`produkt zadanie ${
                  produkt.gotowe
                    ? 'gotowe'
                    : ''
                }`}
              >
                <div className="opis-zadania">
                  <strong>
                    {produkt.nazwa}
                  </strong>

                  <span className="ilosc-produkcja">
                    {produkt.ilosc}{' '}
                    {produkt.jednostka}
                  </span>

                  <span
                    className={`priorytet ${produkt.priorytet}`}
                  >
                    {produkt.priorytet ===
                    'pilny'
                      ? 'Pilny'
                      : produkt.priorytet ===
                          'wysoki'
                        ? 'Wysoki'
                        : 'Normalny'}
                  </span>
                </div>

                <button
                  className="gotowe-button"
                  onClick={() =>
                    oznaczGotowe(
                      produkt.id
                    )
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

  // -----------------------------------------
  // EKRAN PLANOWANIA
  // -----------------------------------------

  return (
    <div className="app">
      <header>
        <h1>ZAGOTÓWKI</h1>

        <p>
          Plan produkcji na jutro
        </p>
      </header>

      <main>
        <div
          style={{
            marginBottom: '20px',
          }}
        >
          <strong>
            📍 {wybranyLokal?.name}
          </strong>

          <button
            className="powrot"
            onClick={zmienLokal}
            style={{
              marginLeft: '15px',
            }}
          >
            Zmień lokal
          </button>
        </div>

        <h2>Co przygotować?</h2>

        <div className="produkty">
          {produktyStartowe.map(
            (produkt) => (
              <div
                className="produkt"
                key={produkt.id}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={
                      wybrane[
                        produkt.id
                      ]?.aktywny ||
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

                  <strong>
                    {produkt.nazwa}
                  </strong>
                </label>

                {wybrane[
                  produkt.id
                ]?.aktywny && (
                  <div className="ustawienia">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Ilość"
                      value={
                        wybrane[
                          produkt.id
                        ]?.ilosc ||
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
                        wybrane[
                          produkt.id
                        ]?.jednostka ||
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
                      {jednostki.map(
                        (jednostka) => (
                          <option
                            key={
                              jednostka
                            }
                            value={
                              jednostka
                            }
                          >
                            {jednostka}
                          </option>
                        )
                      )}
                    </select>

                    <select
                      value={
                        wybrane[
                          produkt.id
                        ]?.priorytet ||
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
            )
          )}
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