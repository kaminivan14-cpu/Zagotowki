export default function ProductionScreen({
  wybranyLokal,
  pozostalo,
  pracownik,
  edytujPlan,
  pokazDodawaniePozycji,
  setPokazDodawaniePozycji,
  nowaPozycja,
  setNowaPozycja,
  jednostki,
  dodajPozycjeDoPlanu,
  zmienLokal,
  pobierzPracownikow,
  wylogujPracownika,
  pobierzHistorie,
  ladowanieHistorii,
  pobierzZaplanowanePlany,
  ladowaniePlanow,
  plan,
  obliczCzas,
  rozpocznijPrace,
  usunPozycje,
  edycjaPozycjiId,
  setEdycjaPozycjiId,
  edytowanaPozycja,
  setEdytowanaPozycja,
  zapiszEdycjePozycji,
  oznaczGotowe,
  zakonczPlan,
}) {
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

            {['administrator', 'manager', 'su-chef'].includes(pracownik?.role) && (
  <button
    className="powrot"
    onClick={edytujPlan}
  >
    ← Edytuj plan
  </button>
)}
{['administrator', 'manager', 'su-chef'].includes(pracownik?.role) && (
  <button
    className="powrot"
    onClick={() =>
      setPokazDodawaniePozycji(!pokazDodawaniePozycji)
    }
    style={{ marginLeft: '10px' }}
  >
    ➕ Dodaj pozycję
  </button>
)}
          </div>
{pokazDodawaniePozycji &&
  ['administrator', 'manager', 'su-chef'].includes(pracownik?.role) && (
    <div
      className="produkt"
      style={{ marginBottom: '20px' }}
    >
      <h3>➕ Dodaj pozycję do planu</h3>

      <input
        type="text"
        placeholder="Nazwa, np. Awokado"
        value={nowaPozycja.nazwa}
        onChange={(e) =>
          setNowaPozycja({
            ...nowaPozycja,
            nazwa: e.target.value,
          })
        }
      />

      <input
        type="number"
        min="0"
        step="0.1"
        placeholder="Ilość"
        value={nowaPozycja.ilosc}
        onChange={(e) =>
          setNowaPozycja({
            ...nowaPozycja,
            ilosc: e.target.value,
          })
        }
      />

      <select
        value={nowaPozycja.jednostka}
        onChange={(e) =>
          setNowaPozycja({
            ...nowaPozycja,
            jednostka: e.target.value,
          })
        }
      >
        {jednostki.map((jednostka) => (
          <option key={jednostka} value={jednostka}>
            {jednostka}
          </option>
        ))}
      </select>

      <select
        value={nowaPozycja.priorytet}
        onChange={(e) =>
          setNowaPozycja({
            ...nowaPozycja,
            priorytet: e.target.value,
          })
        }
      >
        <option value="normalny">Normalny</option>
        <option value="wysoki">Wysoki</option>
        <option value="pilny">Pilny</option>
      </select>

      <button
        className="zatwierdz"
        onClick={dodajPozycjeDoPlanu}
      >
        Dodaj do planu
      </button>

      <button
        className="powrot"
        onClick={() => setPokazDodawaniePozycji(false)}
      >
        Anuluj
      </button>
    </div>
)}
          {pracownik?.role === 'administrator' && (
  <button
    className="powrot"
    onClick={zmienLokal}
    style={{
      marginBottom: '20px',
    }}
  >
    📍 Zmień lokal
  </button>
)}

{['administrator', 'manager'].includes(pracownik?.role) && (
  <button
    className="powrot"
    onClick={pobierzPracownikow}
    style={{
      marginBottom: '20px',
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
    marginBottom: '20px',
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
    marginBottom: '20px',
    marginLeft: '10px',
  }}
>
  {ladowanieHistorii
    ? 'Ładowanie...'
    : '📊 Historia'}
</button>
{['administrator', 'manager', 'su-chef'].includes(pracownik?.role) && (
  <button
    className="powrot"
    onClick={pobierzZaplanowanePlany}
    disabled={ladowaniePlanow}
    style={{
      marginBottom: '20px',
      marginLeft: '10px',
    }}
  >
    {ladowaniePlanow
      ? 'Ładowanie...'
      : '📋 Zaplanowane'}
  </button>
)}
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
                  {produkt.started_at && (
  <span className="czas-produkcji">
    {produkt.gotowe
      ? `✅ ${obliczCzas(
          produkt.started_at,
          produkt.completed_at
        )}`
      : `🟠 W robocie · ${obliczCzas(
          produkt.started_at
        )}`}
  </span>
)}
                </div>

           {!produkt.started_at && !produkt.gotowe && (
  <button
    className="w-robocie-button"
    onClick={() => rozpocznijPrace(produkt.id)}
  >
    ▶ W robocie
  </button>
)}
{!produkt.started_at &&
  !produkt.gotowe &&
  ['administrator', 'manager', 'su-chef'].includes(pracownik?.role) && (
    <button
      onClick={() => usunPozycje(produkt)}
      style={{
        marginLeft: '8px',
        padding: '10px 14px',
        cursor: 'pointer',
      }}
    >
      🗑 Usuń
    </button>
)}
{!produkt.started_at &&
  !produkt.gotowe &&
  ['administrator', 'manager', 'su-chef'].includes(pracownik?.role) && (
    <>
      <button
        onClick={() => {
          if (edycjaPozycjiId === produkt.id) {
            setEdycjaPozycjiId(null)
            return
          }

          setEdycjaPozycjiId(produkt.id)

          setEdytowanaPozycja({
            nazwa: produkt.nazwa,
            ilosc: produkt.ilosc,
            jednostka: produkt.jednostka,
            priorytet: produkt.priorytet,
          })
        }}
        style={{
          marginLeft: '8px',
          padding: '10px 14px',
          cursor: 'pointer',
        }}
      >
        ✏️ Edytuj
      </button>

      {edycjaPozycjiId === produkt.id && (
        <div
          style={{
            width: '100%',
            marginTop: '15px',
          }}
        >
          <input
            type="text"
            placeholder="Nazwa"
            value={edytowanaPozycja.nazwa}
            onChange={(e) =>
              setEdytowanaPozycja({
                ...edytowanaPozycja,
                nazwa: e.target.value,
              })
            }
          />

          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="Ilość"
            value={edytowanaPozycja.ilosc}
            onChange={(e) =>
              setEdytowanaPozycja({
                ...edytowanaPozycja,
                ilosc: e.target.value,
              })
            }
          />

          <select
            value={edytowanaPozycja.jednostka}
            onChange={(e) =>
              setEdytowanaPozycja({
                ...edytowanaPozycja,
                jednostka: e.target.value,
              })
            }
          >
            {jednostki.map((jednostka) => (
              <option key={jednostka} value={jednostka}>
                {jednostka}
              </option>
            ))}
          </select>

          <select
            value={edytowanaPozycja.priorytet}
            onChange={(e) =>
              setEdytowanaPozycja({
                ...edytowanaPozycja,
                priorytet: e.target.value,
              })
            }
          >
            <option value="normalny">Normalny</option>
            <option value="wysoki">Wysoki</option>
            <option value="pilny">Pilny</option>
          </select>

          <button
            onClick={() => zapiszEdycjePozycji(produkt)}
          >
            💾 Zapisz
          </button>

          <button
            onClick={() => setEdycjaPozycjiId(null)}
            style={{ marginLeft: '8px' }}
          >
            Anuluj
          </button>
        </div>
      )}
    </>
)}
{produkt.started_at && !produkt.gotowe && (
  <button
    className="gotowe-button"
    onClick={() => oznaczGotowe(produkt.id)}
  >
    ✓ Gotowe
  </button>
)}

{produkt.gotowe && (
  <button
    className="gotowe-button"
    disabled
  >
    ✓ Gotowe
  </button>
)}
              </div>
            ))}
          </div>

          {pozostalo === 0 && (
            <div className="wszystko-gotowe">
              ✓ Wszystko gotowe
            </div>
          )}

        {['administrator', 'manager', 'su-chef'].includes(pracownik?.role) && (
  <button
    className="zakoncz-plan"
    onClick={zakonczPlan}
  >
    Zakończ plan
  </button>
)}
        </main>
      </div>
  )
}
