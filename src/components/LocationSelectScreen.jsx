export default function LocationSelectScreen({
  pracownik,
  lokale,
  wylogujPracownika,
  pobierzPracownikow,
  wybierzLokal,
}) {
  return (
    <div className="app">
      <header>
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
      {['administrator', 'manager'].includes(pracownik.role) && (
  <button
    className="wyloguj-button"
   onClick={pobierzPracownikow}
    style={{
      marginLeft: '10px',
    }}
  >
    👥 Pracownicy
  </button>
)}
      </header>

      <main>  

          <h2>Gdzie pracujesz?</h2>

          <div className="produkty">
           {lokale
  .filter((lokal) => {
    if (pracownik.role === 'administrator') {
      return true
    }

    return lokal.id === pracownik.location_id
  })
  .map((lokal) => (
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
