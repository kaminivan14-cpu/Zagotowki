export default function PlanningScreen({
  wybranyLokal,
  pracownik,
  zmienLokal,
  pobierzPracownikow,
  wylogujPracownika,
  pobierzHistorie,
  ladowanieHistorii,
  dataPlanu,
  zmienDatePlanu,
  produktyStartowe,
  wybrane,
  zmienProdukt,
  jednostki,
  zatwierdzPlan,
  zapisywanie,
}) {
  return (
    <div className="app">
      <header>
        <h1>ZAGOTÓWKI</h1>

        <p>
          Plan produkcji
        </p>
      </header>

      <main>
        <div
          style={{
            marginBottom: '20px',
          }}
        >
         <div
  style={{
    display: 'inline-flex',
    flexDirection: 'column',
    gap: '4px',
    verticalAlign: 'middle',
  }}
>
  <strong>
    📍 {wybranyLokal?.name}
  </strong>

  <span
    style={{
      color: '#64748b',
      fontSize: '15px',
      fontWeight: '500',
      paddingLeft: '2px',
    }}
  >
    👤 {pracownik?.name}
  </span>
</div>
          <button
            className="powrot"
            onClick={zmienLokal}
            style={{
              marginLeft: '15px',
            }}
          >
            Zmień lokal
          </button>
          {['administrator', 'manager'].includes(pracownik?.role) && (
  <button
    className="powrot"
    onClick={pobierzPracownikow}
    style={{
      marginLeft: '10px',
    }}
  >
    👥 Pracownicy
  </button>
)}
<button
  className="powrot"
  onClick={wylogujPracownika}
  style={{
    marginLeft: '10px',
  }}
>
  🚪 Wyloguj
</button>
<button
  className="powrot"
  onClick={pobierzHistorie}
  disabled={ladowanieHistorii}
  style={{
    marginLeft: '10px',
  }}
>
  {ladowanieHistorii
    ? 'Ładowanie...'
    : '📊 Historia'}
</button>
        </div>
<div
  className="produkt"
  style={{
    marginBottom: '20px',
  }}
>
  <strong>📅 Data planu</strong>

  <input
    type="date"
    value={dataPlanu}
    onChange={zmienDatePlanu}
    style={{
      display: 'block',
      marginTop: '10px',
    }}
  />
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
