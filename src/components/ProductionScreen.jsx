import { Fragment, useState } from 'react'
import TechnologyCard from './TechnologyCard'
import ProductCombobox from './ProductCombobox'
import PlanItemDetailsFields from './PlanItemDetailsFields'
import { hasProductionHistory } from '../planItemDetails'

export default function ProductionScreen({
  onRequirements,
  mozeUsunacPlan,
  usunPlan,
  usuwaniePlanu,
  tylkoOdczyt,
  mozeRealizowac,
  mozeEdytowac,
  statusPlanu,
  dataPlanu,
  wznowPlan,
  wznowienieDostepne,
  wznawianie,
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
          <p style={{ marginBottom: '16px' }}>Plan: {dataPlanu}</p>
          <button className="powrot" onClick={onRequirements}>📦 Zapotrzebowanie ogólne</button>
          {statusPlanu === 'completed' && <p role="status">✓ Zakończony</p>}
          {tylkoOdczyt && <p role="status">Plan tylko do odczytu.</p>}
          {statusPlanu === 'completed' && ['administrator', 'manager', 'su-chef'].includes(pracownik?.role) && (
            <div style={{ margin: '16px 0' }}>
              <button className="powrot" onClick={wznowPlan} disabled={!wznowienieDostepne || wznawianie}>
                {wznawianie ? 'Wznawianie…' : 'Wznów plan'}
              </button>
              {!wznowienieDostepne && <p>Wznowienie jest chwilowo niedostępne.</p>}
            </div>
          )}
          {mozeUsunacPlan && <div className="plan-delete-action">
            <button className="powrot" onClick={usunPlan} disabled={usuwaniePlanu}>
              {usuwaniePlanu ? 'Usuwanie…' : '🗑 Usuń plan'}
            </button>
            {(statusPlanu !== 'active' || plan.some(hasProductionHistory)) &&
              <p>Rozpoczętego lub zakończonego planu nie można usunąć. Historia pozostaje zachowana.</p>}
          </div>}
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

            {mozeEdytowac && (
  <button
    className="powrot"
    onClick={edytujPlan}
  >
    ← Edytuj plan
  </button>
)}
{mozeEdytowac && (
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
  mozeEdytowac && (
    <div
      className="produkt responsive-form"
      style={{ marginBottom: '20px' }}
    >
      <h3>➕ Dodaj pozycję do planu</h3>

      <ProductCombobox
        produkty={produkty}
        ladowanie={ladowanieProduktow}
        blad={bladProduktow}
        value={nowaPozycja}
        onChange={(produkt) => setNowaPozycja({ ...nowaPozycja, ...produkt })}
      />

      <label className="item-form-field">Ilość
      <input
        type="number"
        min="0"
        step="0.1"
        aria-label="Ilość"
        placeholder="Ilość"
        value={nowaPozycja.ilosc}
        onChange={(e) =>
          setNowaPozycja({
            ...nowaPozycja,
            ilosc: e.target.value,
          })
        }
      />
      </label>

      <label className="item-form-field">Jednostka
      <select
        aria-label="Jednostka"
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
      </label>

      <label className="item-form-field">Priorytet
      <select
        aria-label="Priorytet"
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
      </label>

      <PlanItemDetailsFields value={nowaPozycja}
        onChange={(field, value) => setNowaPozycja({ ...nowaPozycja, [field]: value })} />

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
{pracownik && (
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
      : '← Lista planów'}
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
                  {produkt.ready_time && <span className="item-ready-time">🕐 Gotowe na {produkt.ready_time.slice(0, 5)}</span>}
                  {produkt.note && <p className="item-note">{produkt.note}</p>}
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

           {mozeRealizowac && !produkt.started_at && !produkt.gotowe && (
  <button
    className="w-robocie-button"
    onClick={() => rozpocznijPrace(produkt.id)}
  >
    ▶ W robocie
  </button>
)}
{!hasProductionHistory(produkt) &&
  mozeEdytowac && (
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
{!hasProductionHistory(produkt) &&
  mozeEdytowac && (
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
            note: produkt.note || '',
            ready_time: produkt.ready_time?.slice(0, 5) || '',
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
            aria-label="Ilość"
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

          <PlanItemDetailsFields value={edytowanaPozycja}
            onChange={(field, value) => setEdytowanaPozycja({ ...edytowanaPozycja, [field]: value })} />
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
{mozeRealizowac && produkt.started_at && !produkt.gotowe && (
  <button
    className="gotowe-button"
    onClick={() => oznaczGotowe(produkt.id)}
  >
    ✓ Gotowe
  </button>
)}

{produkt.gotowe && (tylkoOdczyt ? <span>✓ Gotowe</span> :
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
                  requestedQuantity={produkt.ilosc}
                  unit={produkt.jednostka}
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

        {mozeEdytowac && (
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
