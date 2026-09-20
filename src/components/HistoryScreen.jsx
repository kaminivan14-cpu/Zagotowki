export default function HistoryScreen({
  wybranyLokal,
  historia,
  historiaWedlugDni,
  otwartyDzien,
  setOtwartyDzien,
  formatujGodzine,
  obliczCzas,
  onPowrot,
}) {
  return (
    <div className="app">
      <header>
        <h1>ZAGOTÓWKI</h1>
        <p>Historia — {wybranyLokal?.name}</p>
      </header>

      <main>
        <div className="naglowek-produkcji">
          <div>
            <h2>Historia produkcji</h2>

            <p className="licznik">
              📍 {wybranyLokal?.name}
            </p>
          </div>

          <button
            className="powrot"
            onClick={onPowrot}
          >
            ← Powrót
          </button>
        </div>

        {historia.length === 0 && (
          <div className="produkt">
            Brak zakończonych planów.
          </div>
        )}

        <div className="produkty">
          {Object.entries(historiaWedlugDni).map(
            ([data, planyDnia]) => {
              const otwarty = otwartyDzien === data

              const wszystkiePozycje = planyDnia.flatMap(
                (planDnia) => planDnia.Plan_items || []
              )

              return (
                <div
                  className="produkt"
                  key={data}
                  style={{
                    cursor: 'pointer',
                  }}
                >
                  {/* NAGŁÓWEK DNIA */}
                  <div
                    className="history-day-toggle"
                    onClick={() =>
                      setOtwartyDzien(
                        otwarty ? null : data
                      )
                    }
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '20px',
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin: 0,
                        }}
                      >
                        📅{' '}
                        {new Date(
                          `${data}T12:00:00`
                        ).toLocaleDateString('pl-PL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </h3>

                      <div
                        style={{
                          marginTop: '8px',
                          opacity: 0.65,
                          fontSize: '15px',
                        }}
                      >
                        {wszystkiePozycje.length}{' '}
                        {wszystkiePozycje.length === 1
                          ? 'pozycja'
                          : 'pozycji'}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: '28px',
                        fontWeight: '600',
                      }}
                    >
                      {otwarty ? '⌃' : '⌄'}
                    </div>
                  </div>

                  {/* ROZWINIĘTA HISTORIA DNIA */}
                  {otwarty && (
                    <div
                      style={{
                        marginTop: '20px',
                        borderTop: '1px solid #e5e7eb',
                        paddingTop: '10px',
                      }}
                    >
                      {wszystkiePozycje.map(
                        (produkt) => (
                          <div
                            key={produkt.id}
                            className="historia-pozycja"
                            style={{
                              padding: '16px 0',
                            }}
                          >
                            <div>
                              <strong>
                                {produkt.nazwa}
                              </strong>

                              <span>
                                {' '}
                                — {produkt.ilosc}{' '}
                                {produkt.jednostka}
                              </span>
                            </div>
<div
  style={{
    marginTop: '6px',
    fontSize: '14px',
    color: '#64748b',
  }}
>
👤 {produkt.employee_name || 'Brak danych'}
</div>

                            <div className="historia-czas">
                              {produkt.started_at &&
                              produkt.completed_at ? (
                                <>
                                  <div>
                                    ▶{' '}
                                    {formatujGodzine(
                                      produkt.started_at
                                    )}
                                    {' → '}
                                    ✓{' '}
                                    {formatujGodzine(
                                      produkt.completed_at
                                    )}
                                  </div>

                                  <div>
                                    ⏱{' '}
                                    {obliczCzas(
                                      produkt.started_at,
                                      produkt.completed_at
                                    )}
                                  </div>
                                </>
                              ) : (
                                'Brak czasu'
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )
            }  
          )}
        </div>
      </main>
    </div>
  )
}
