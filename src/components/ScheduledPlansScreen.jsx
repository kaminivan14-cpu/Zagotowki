import { useState } from 'react'

export default function ScheduledPlansScreen({
  wybranyLokal,
  zaplanowanePlany,
  dataPlanu,
  otworzZaplanowanyPlan,
  onPowrot,
  onUtworzPlan,
}) {
  // Data nowego planu nie zmienia daty aktualnie otwartego planu.
  const [dataNowegoPlanu, setDataNowegoPlanu] = useState(dataPlanu)

  return (
    <div className="app">
      <header>
        <h1>ZAGOTÓWKI</h1>
        <p>
          Zaplanowane — {wybranyLokal?.name}
        </p>
      </header>

      <main>
        <div className="naglowek-produkcji">
          <div>
            <h2>📋 Zaplanowane plany</h2>

            <p className="licznik">
              {zaplanowanePlany.length === 0
                ? 'Brak zaplanowanych planów'
                : `Liczba planów: ${zaplanowanePlany.length}`}
            </p>
          </div>

          <button
            className="powrot"
            onClick={onPowrot}
          >
            ← Powrót
          </button>
         
        </div>
<div
  className="produkt new-plan"
  style={{
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap',
  }}
>
  <div>
    <strong>➕ Dodaj nowy plan</strong>

    <div
      style={{
        marginTop: '6px',
        color: '#64748b',
      }}
    >
      Wybierz dzień produkcji
    </div>
  </div>

  <input
    type="date"
    value={dataNowegoPlanu}
    onChange={(e) => setDataNowegoPlanu(e.target.value)}
  />

  <button
    className="powrot"
    onClick={() => onUtworzPlan(dataNowegoPlanu)}
  >
    ➕ Utwórz plan
  </button>
</div>
        <div className="produkty">
          {zaplanowanePlany.map((planZaplanowany) => (
            <div
              key={planZaplanowany.id}
              className="produkt"
            >
              <div>
                <strong>
                  📅{' '}
                  {new Date(
                    `${planZaplanowany.plan_date}T12:00:00`
                  ).toLocaleDateString('pl-PL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </strong>

                <div
                  style={{
                    marginTop: '8px',
                    color: '#64748b',
                  }}
                >
                  Pozycji:{' '}
                  {planZaplanowany.Plan_items?.length || 0}
                </div>
                <button
  className="powrot"
  onClick={() => otworzZaplanowanyPlan(planZaplanowany)}
  style={{
    marginTop: '12px',
  }}
>
  📂 Otwórz plan
</button>
              </div>
            </div>
          ))}
        </div>

        {zaplanowanePlany.length === 0 && (
          <div
            className="produkt"
            style={{
              marginTop: '20px',
              textAlign: 'center',
            }}
          >
            📭 Nie ma żadnych aktywnych planów
            na dziś ani przyszłe dni.
          </div>
        )}
      </main>
    </div>
  )
}
