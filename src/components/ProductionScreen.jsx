import { Fragment, useState } from 'react'
import TechnologyCard from './TechnologyCard'

export default function ProductionScreen({
  wybranyLokal,
  pozostalo,
  pracownik,
  edytujPlan,
  pokazDodawaniePozycji,
  setPokazDodawaniePozycji,
  produkty,
  ladowanieProduktow,
  bladProduktow,
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
  const [otwartaKartaId, setOtwartaKartaId] = useState(null)

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
    style={{ marginLeft: 'var(--inline-action-offset, 10px)' }}
  >
    ➕ Dodaj pozycję
  </button>
)}
          </div>
{pokazDodawaniePozycji &&
  ['administrator', 'manager', 'su-chef'].includes(pracownik?.role) && (
    <div
      className="produkt responsive-form"
      style={{ marginBottom: '20px' }}
    >
      <h3>➕ Dodaj pozycję do planu</h3>

      <select
        aria-label="Produkt z katalogu"
        value={nowaPozycja.product_external_id ?? ''}
        disabled={ladowanieProduktow || Boolean(bladProduktow)}
        onChange={(e) => {
          const produkt = produkty.find((element) =>
            String(element.external_id) === e.target.value
          )
          setNowaPozycja({
            ...nowaPozycja,
            product_external_id: produkt?.external_id ?? null,
            nazwa: produkt?.name ?? '',
          })
        }}
      >
        <option value="">Własna pozycja</option>
        {produkty.map((produkt) => (
          <option key={produkt.id} value={produkt.external_id}>{produkt.name}</option>
        ))}
      </select>
      {ladowanieProduktow && <div role="status">Ładowanie katalogu produktów...</div>}
      {bladProduktow && <div role="alert">{bladProduktow} Możesz dodać własną pozycję.</div>}
      {!ladowanieProduktow && !bladProduktow && produkty.length === 0 && (
        <div role="status">Katalog produktów jest pusty. Możesz dodać własną pozycję.</div>
      )}

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
    marginBottom: '20px',
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
    marginBottom: '20px',
    marginLeft: 'var(--inline-action-offset, 10px)',
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
      marginLeft: 'var(--inline-action-offset, 10px)',
    }}
  >
    {ladowaniePlanow
      ? 'Ładowanie...'
      : '📋 Zaplanowane'}
  </button>
)}
          <div className="produkty">
            {plan.map((produkt) => (
              <Fragment key={produkt.id}>
              <div
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

                {produkt.product_external_id != null && (
                  <button
                    type="button"
                    className="powrot"
                    aria-expanded={otwartaKartaId === produkt.id}
                    aria-controls={`technology-card-${produkt.id}`}
                    onClick={() => setOtwartaKartaId((id) => id === produkt.id ? null : produkt.id)}
                  >
                    Karta technologiczna
                  </button>
                )}

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
        marginLeft: 'var(--inline-action-offset, 8px)',
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
            product_external_id: produkt.product_external_id ?? null,
            nazwa: produkt.nazwa,
            ilosc: produkt.ilosc,
            jednostka: produkt.jednostka,
            priorytet: produkt.priorytet,
          })
        }}
        style={{
          marginLeft: 'var(--inline-action-offset, 8px)',
          padding: '10px 14px',
          cursor: 'pointer',
        }}
      >
        ✏️ Edytuj
      </button>

      {edycjaPozycjiId === produkt.id && (
        <div
          className="responsive-form task-edit"
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
            style={{ marginLeft: 'var(--inline-action-offset, 8px)' }}
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
              {otwartaKartaId === produkt.id && produkt.product_external_id != null && (
                <TechnologyCard
                  key={String(produkt.product_external_id)}
                  externalId={produkt.product_external_id}
                  id={`technology-card-${produkt.id}`}
                  onClose={() => {
                    setOtwartaKartaId(null)
                    document.querySelector(`[aria-controls="technology-card-${produkt.id}"]`)?.focus()
                  }}
                />
              )}
              </Fragment>
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
