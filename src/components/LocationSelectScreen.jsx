export default function LocationSelectScreen({
  header,
  pracownik,
  lokale,
  wylogujPracownika,
  pobierzPracownikow,
  wybierzLokal,
}) {
  return (
    <div className="app">
      {header || <header>
        <h1>ZAGOTÓWKI</h1>

        <p>
          👤 {pracownik.name} · {pracownik.role}
        </p>

        <button
          className="wyloguj-button"
          onClick={wylogujPracownika}
        >
          Wyloguj
        </button>
      {['owner', 'administrator', 'manager'].includes(pracownik.role) && (
  <button
    className="wyloguj-button"
   onClick={pobierzPracownikow}
    style={{
      marginLeft: 'var(--inline-action-offset, 10px)',
    }}
  >
    👥 Pracownicy
  </button>
)}
      </header>}

      <main className="location-choice">

          <h2>Wybierz lokal</h2>

          <div className="location-cards">
           {lokale
  .filter((lokal) => {
    if (['owner', 'administrator'].includes(pracownik.role)) {
      return true
    }

    return lokal.id === pracownik.location_id
  })
  .map((lokal) => (
              <button
                key={lokal.id}
                className="location-card"
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
                    className="location-city"
                    style={{
                      marginLeft: 'var(--inline-action-offset, 10px)',
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
