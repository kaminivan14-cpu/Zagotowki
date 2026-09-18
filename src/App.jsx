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
  useEffect(() => {
  const testSupabase = async () => {
    const { data, error } = await supabase
      .from('Plans')
      .select('*')

    console.log('SUPABASE DATA:', data)
    console.log('SUPABASE ERROR:', error)
  }

  testSupabase()
}, [])
  const [plan, setPlan] = useState(() => {
    const zapisanyPlan = localStorage.getItem('zagotowki-plan')

    if (zapisanyPlan) {
      try {
        return JSON.parse(zapisanyPlan)
      } catch {
        return []
      }
    }

    return []
  })

  const [ekran, setEkran] = useState(() => {
    const zapisanyPlan = localStorage.getItem('zagotowki-plan')
    return zapisanyPlan ? 'produkcja' : 'planowanie'
  })

  const [wybrane, setWybrane] = useState({})

  useEffect(() => {
    if (plan.length > 0) {
      localStorage.setItem('zagotowki-plan', JSON.stringify(plan))
    }
  }, [plan])

  const zmienProdukt = (id, pole, wartosc) => {
    setWybrane((poprzednie) => ({
      ...poprzednie,
      [id]: {
        ...poprzednie[id],
        [pole]: wartosc,
      },
    }))
  }

  const zatwierdzPlan = () => {
    const nowyPlan = produktyStartowe
      .filter((produkt) => wybrane[produkt.id]?.aktywny)
      .map((produkt) => ({
        id: produkt.id,
        nazwa: produkt.nazwa,

        ilosc:
          wybrane[produkt.id]?.ilosc || '',

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
        Number(produkt.ilosc) <= 0
    )

    if (brakIlosci) {
      alert('Wpisz poprawną ilość dla każdego produktu.')
      return
    }

    setPlan(nowyPlan)

    localStorage.setItem(
      'zagotowki-plan',
      JSON.stringify(nowyPlan)
    )

    setEkran('produkcja')
  }

  const oznaczGotowe = (id) => {
    setPlan((poprzedniPlan) =>
      poprzedniPlan.map((produkt) =>
        produkt.id === id
          ? {
              ...produkt,
              gotowe: !produkt.gotowe,
            }
          : produkt
      )
    )
  }

  const edytujPlan = () => {
    const daneDoEdycji = {}

    plan.forEach((produkt) => {
      daneDoEdycji[produkt.id] = {
        aktywny: true,
        ilosc: produkt.ilosc,
        jednostka: produkt.jednostka,
        priorytet: produkt.priorytet,
      }
    })

    setWybrane(daneDoEdycji)
    setEkran('planowanie')
  }

  const zakonczPlan = () => {
    const potwierdzenie = window.confirm(
      'Czy na pewno zakończyć dzisiejszy plan produkcji?'
    )

    if (!potwierdzenie) return

    localStorage.removeItem('zagotowki-plan')

    setPlan([])
    setWybrane({})
    setEkran('planowanie')
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
                Pozostało:{' '}
                <strong>{pozostalo}</strong>
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
                    {produkt.ilosc}{' '}
                    {produkt.jednostka}
                  </span>

                  <span
                    className={`priorytet ${produkt.priorytet}`}
                  >
                    {produkt.priorytet === 'pilny'
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

                  {/* ILOŚĆ */}

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

                  {/* JEDNOSTKA */}

                  <select
                    value={
                      wybrane[produkt.id]
                        ?.jednostka ||
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

                  {/* PRIORYTET */}

                  <select
                    value={
                      wybrane[produkt.id]
                        ?.priorytet ||
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
        >
          Zatwierdź plan
        </button>
      </main>
    </div>
  )
}

export default App