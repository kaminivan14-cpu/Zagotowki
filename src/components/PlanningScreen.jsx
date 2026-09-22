import { useState } from 'react'
import PlanItemDetailsFields from './PlanItemDetailsFields'

export default function PlanningScreen({
  onListaPlanow,
  wybranyLokal,
  pracownik,
  zmienLokal,
  pobierzPracownikow,
  wylogujPracownika,
  pobierzHistorie,
  ladowanieHistorii,
  dataPlanu,
  zmienDatePlanu,
  produkty,
  ladowanieProduktow,
  bladProduktow,
  ponowPobranieProduktow,
  wybrane,
  zmienProdukt,
  jednostki,
  zatwierdzPlan,
  zapisywanie,
}) {
  const [szukaj, setSzukaj] = useState('')
  const fraza = szukaj.trim().toLocaleLowerCase('pl-PL')
  const widoczneProdukty = produkty.filter((produkt) =>
    produkt.name.toLocaleLowerCase('pl-PL').includes(fraza)
  )

  return (
    <div className="app planning-screen">
      <header>
        <h1>ZAGOTÓWKI</h1>

        <p>
          Plan produkcji
        </p>
      </header>

      <main>
        <div
          className="screen-navigation"
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
              marginLeft: 'var(--inline-action-offset, 15px)',
            }}
          >
            Zmień lokal
          </button>
          {['administrator', 'manager'].includes(pracownik?.role) && (
  <button
    className="powrot"
    onClick={pobierzPracownikow}
    style={{
      marginLeft: 'var(--inline-action-offset, 10px)',
    }}
  >
    👥 Pracownicy
  </button>
)}
<button
  className="powrot"
  onClick={wylogujPracownika}
  style={{
    marginLeft: 'var(--inline-action-offset, 10px)',
  }}
>
  🚪 Wyloguj
</button>
<button
  className="powrot"
  onClick={pobierzHistorie}
  disabled={ladowanieHistorii}
  style={{
    marginLeft: 'var(--inline-action-offset, 10px)',
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
        {['administrator', 'manager', 'su-chef'].includes(pracownik?.role) && (
          <button className="powrot" onClick={onListaPlanow} disabled={zapisywanie}
            style={{ marginBottom: '20px' }}>← Lista planów</button>
        )}
        <h2>Co przygotować?</h2>

        <input
          className="product-search"
          type="search"
          aria-label="Szukaj produktu"
          placeholder="Szukaj produktu..."
          value={szukaj}
          onChange={(e) => setSzukaj(e.target.value)}
          disabled={ladowanieProduktow || Boolean(bladProduktow)}
        />
        {ladowanieProduktow && <p role="status">Ładowanie katalogu produktów...</p>}
        {bladProduktow && (
          <div role="alert">
            <p>{bladProduktow}</p>
            <button className="powrot" onClick={ponowPobranieProduktow}>Spróbuj ponownie</button>
          </div>
        )}
        {!ladowanieProduktow && !bladProduktow && (
          <p role="status">
            {produkty.length === 0 ? 'Katalog produktów jest pusty.' :
              widoczneProdukty.length === 0 ? 'Brak produktów pasujących do wyszukiwania.' :
                `Produkty: ${widoczneProdukty.length} z ${produkty.length}`}
          </p>
        )}

        <div className="produkty" aria-busy={ladowanieProduktow}>
          {!ladowanieProduktow && !bladProduktow && widoczneProdukty.map(
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
                    {produkt.name}
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
                        'kg'
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
                    <PlanItemDetailsFields value={wybrane[produkt.id] || {}}
                      onChange={(field, value) => zmienProdukt(produkt.id, field, value)} />
                  </div>
                )}
              </div>
            )
          )}
        </div>

        <button
          className="zatwierdz"
          onClick={zatwierdzPlan}
          disabled={zapisywanie || ladowanieProduktow || Boolean(bladProduktow) || produkty.length === 0}
        >
          {zapisywanie
            ? 'Zapisywanie...'
            : 'Zatwierdź plan'}
        </button>
      </main>
    </div>
  )
}
