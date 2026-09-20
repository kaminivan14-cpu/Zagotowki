export default function NoPlanScreen({
  wybranyLokal,
  pracownik,
  pobierzHistorie,
  ladowanieHistorii,
  wylogujPracownika,
}) {
  return (
    <div className="app">
      <header>
        <h1>ZAGOTÓWKI</h1>
        <p>{wybranyLokal?.name}</p>
      </header>

      <main>
        <div
          className="produkt empty-plan"
          style={{
            textAlign: 'center',
            padding: 'var(--empty-plan-padding, 50px 30px)',
          }}
        >
          <div style={{ fontSize: '55px' }}>
            ✅
          </div>

          <h2>Brak zadań do wykonania</h2>

          <p style={{ opacity: 0.7 }}>
            Aktualnie nie ma aktywnego planu produkcji.
          </p>

          <p style={{ opacity: 0.6 }}>
            👤 {pracownik?.name}
          </p>
        </div>

        <button
          className="powrot"
          onClick={pobierzHistorie}
          disabled={ladowanieHistorii}
        >
          {ladowanieHistorii
            ? 'Ładowanie...'
            : '📊 Historia'}
        </button>

        <button
          className="powrot"
          onClick={wylogujPracownika}
          style={{ marginLeft: 'var(--inline-action-offset, 10px)' }}
        >
          🚪 Wyloguj
        </button>
      </main>
    </div>
  )
}
