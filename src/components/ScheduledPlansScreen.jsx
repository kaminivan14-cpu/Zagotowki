import { useState } from 'react'

export default function ScheduledPlansScreen({
  pracownik,
  dzisiaj,
  onWyloguj,
  onHistoria,
  ladowanieHistorii,
  wybranyLokal,
  zaplanowanePlany,
  dataPlanu,
  otworzZaplanowanyPlan,
  onPowrot,
  onUtworzPlan,
  sprawdzaniePlanu,
  komunikatNowegoPlanu,
  onZmienDateNowegoPlanu,
}) {
  // Data nowego planu nie zmienia daty aktualnie otwartego planu.
  const [dataNowegoPlanu, setDataNowegoPlanu] = useState(dataPlanu)

  const employee = pracownik?.role === 'employee'
  const grupy = employee ? [
    { tytul: 'DZISIAJ', plany: zaplanowanePlany.filter((plan) => plan.plan_date === dzisiaj) },
    { tytul: 'NADCHODZĄCE PLANY', plany: zaplanowanePlany.filter((plan) => plan.plan_date > dzisiaj) },
  ] : [{ tytul: null, plany: zaplanowanePlany }]

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
          {employee && <>
            <button className="powrot" onClick={onHistoria} disabled={ladowanieHistorii}>
              {ladowanieHistorii ? 'Ładowanie…' : '📊 Historia'}
            </button>
            <button className="powrot" onClick={onWyloguj}>Wyloguj</button>
          </>}
        </div>
{!employee && <div
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
    disabled={sprawdzaniePlanu}
    onChange={(e) => {
      setDataNowegoPlanu(e.target.value)
      onZmienDateNowegoPlanu()
    }}
  />

  <button
    className="powrot"
    onClick={() => onUtworzPlan(dataNowegoPlanu)}
    disabled={sprawdzaniePlanu}
  >
    ➕ Utwórz plan
  </button>
</div>}
        {komunikatNowegoPlanu && (
          <p role="alert">{komunikatNowegoPlanu}</p>
        )}
        {grupy.map((grupa, index) => (
        <section key={index} style={{ marginTop: '24px' }}>
          {grupa.tytul && <h2>{grupa.tytul}</h2>}
          {employee && grupa.plany.length === 0 && <p>{index === 0 ? 'Brak planu na dziś.' : 'Brak nadchodzących planów.'}</p>}
        <div className="produkty">
          {grupa.plany.map((planZaplanowany) => (
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

                {planZaplanowany.status === 'completed' && <p><strong>✓ Zakończony</strong></p>}
                {employee && planZaplanowany.plan_date > dzisiaj && <p>Tylko do odczytu</p>}
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

        </section>
        ))}
        {!employee && zaplanowanePlany.length === 0 && (
          <div
            className="produkt"
            style={{
              marginTop: '20px',
              textAlign: 'center',
            }}
          >
            📭 Nie ma żadnych planów dla tego lokalu.
          </div>
        )}
      </main>
    </div>
  )
}
