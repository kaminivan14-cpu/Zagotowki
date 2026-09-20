export default function EmployeesScreen({
  pracownik,
  pokazFormularzPracownika,
  setPokazFormularzPracownika,
  nowyPracownik,
  setNowyPracownik,
  lokale,
  zapiszPracownika,
  ladowaniePracownikow,
  pracownicy,
  zmienStatusPracownika,
  edycjaPracownikaId,
  setEdycjaPracownikaId,
  edytowanyPracownik,
  setEdytowanyPracownik,
  zapiszEdycjePracownika,
  zmianaPinId,
  setZmianaPinId,
  nowyPin,
  setNowyPin,
  zmienPinPracownika,
  onPowrot,
}) {
  return (
    <div className="app">
      <header>
        <h1>👥 PRACOWNICY</h1>

        <p>
          Administrator: {pracownik?.name}
        </p>

        <button
          className="wyloguj-button"
          onClick={onPowrot}
        >
          ← Powrót
        </button>
      </header>

      <main>
   <h2>Lista pracowników</h2>

<button
  className="powrot"
  onClick={() => setPokazFormularzPracownika(true)}
>
  + Dodaj pracownika
</button>

{pokazFormularzPracownika && (
  <div className="produkt">
    <h3>Nowy pracownik</h3>

    <input
      type="text"
      placeholder="Imię"
      value={nowyPracownik.name}
      onChange={(e) =>
        setNowyPracownik({
          ...nowyPracownik,
          name: e.target.value,
        })
      }
    />

    <select
      value={nowyPracownik.role}
      onChange={(e) =>
        setNowyPracownik({
          ...nowyPracownik,
          role: e.target.value,
        })
      }
    >
   <option value="employee">Employee</option>
<option value="su-chef">Su-chef</option>
<option value="manager">Manager</option>

{pracownik.role === 'administrator' && (
  <option value="administrator">
    Administrator
  </option>
)}
    </select>

    {pracownik.role === 'administrator' ? (
  <select
    value={nowyPracownik.location_id}
    onChange={(e) =>
      setNowyPracownik({
        ...nowyPracownik,
        location_id: e.target.value,
      })
    }
  >
    <option value="">Wybierz lokal</option>

    {lokale.map((lokal) => (
      <option key={lokal.id} value={lokal.id}>
        {lokal.name}
      </option>
    ))}
  </select>
) : (
  <div
    style={{
      color: '#1f2937',
      fontSize: '18px',
      padding: '10px 14px',
    }}
  >
    📍 Lokal:{' '}
    <strong>
      
  {lokale.find(
    (lokal) => Number(lokal.id) === Number(pracownik.location_id)
  )?.name || 'Brak lokalu'}
</strong>
  
  </div>
)}

    <input
      type="password"
      inputMode="numeric"
      placeholder="PIN (4–8 cyfr)"
      value={nowyPracownik.pin}
      onChange={(e) =>
        setNowyPracownik({
          ...nowyPracownik,
          pin: e.target.value,
        })
      }
    />
<button
  type="button"
  onClick={zapiszPracownika}
>
  Zapisz pracownika
</button>
    <button
      type="button"
      onClick={() =>
        setPokazFormularzPracownika(false)
      }
    >
      Anuluj
    </button>
  </div>
)}

        {ladowaniePracownikow ? (
          <p>Ładowanie...</p>
        ) : (
          <div className="produkty">
            {pracownicy.map((osoba) => (
              <div
                key={osoba.id}
                className="produkt"
              >
                <strong>{osoba.name}</strong>

                <div>
                  Rola: {osoba.role}
                </div>

                <div>
  Lokal:{' '}
  {osoba.location_id
    ? lokale.find(
        (lokal) => Number(lokal.id) === Number(osoba.location_id)
      )?.name || `Lokal ${osoba.location_id}`
    : 'Wszystkie lokale'}
</div>

                <div>
                  Status:{' '}
                  {osoba.active
                    ? '🟢 Aktywny'
                    : '🔴 Nieaktywny'}
                </div>
           {(
  osoba.id !== pracownik.id &&
  (
    pracownik.role === 'administrator' ||
    (
      pracownik.role === 'manager' &&
      ['employee', 'su-chef'].includes(osoba.role)
    )
  )
) && (
  <button
    onClick={() => zmienStatusPracownika(osoba)}
    style={{
      marginTop: '10px',
      padding: '8px 14px',
      cursor: 'pointer',
    }}
  >
    {osoba.active ? '🔴 Dezaktywuj' : '🟢 Aktywuj'}
  </button>
)}
{(
  pracownik.role === 'administrator' ||
  (
    pracownik.role === 'manager' &&
    ['employee', 'su-chef'].includes(osoba.role)
  )
) && (
  <button
    onClick={() => {
      if (edycjaPracownikaId === osoba.id) {
        setEdycjaPracownikaId(null)
        return
      }

      setEdycjaPracownikaId(osoba.id)

      setEdytowanyPracownik({
        name: osoba.name,
        role: osoba.role,
        location_id: osoba.location_id ?? '',
      })
    }}
    style={{
      marginTop: '10px',
      marginLeft: '10px',
      padding: '8px 14px',
      cursor: 'pointer',
    }}
  >
    ✏️ Edytuj
  </button>
)}
{edycjaPracownikaId === osoba.id && (
  <div style={{ marginTop: '15px' }}>

    <input
      type="text"
      placeholder="Imię"
      value={edytowanyPracownik.name}
      onChange={(e) =>
        setEdytowanyPracownik({
          ...edytowanyPracownik,
          name: e.target.value,
        })
      }
    />

    <select
      value={edytowanyPracownik.role}
      onChange={(e) =>
        setEdytowanyPracownik({
          ...edytowanyPracownik,
          role: e.target.value,
        })
      }
    >
      <option value="employee">Employee</option>
      <option value="su-chef">Su-chef</option>
      <option value="manager">Manager</option>

      {pracownik.role === 'administrator' && (
        <option value="administrator">Administrator</option>
      )}
    </select>

    {pracownik.role === 'administrator' && (
      <select
        value={edytowanyPracownik.location_id}
        onChange={(e) =>
          setEdytowanyPracownik({
            ...edytowanyPracownik,
            location_id: e.target.value,
          })
        }
      >
        <option value="">Wybierz lokal</option>

        {lokale.map((lokal) => (
          <option key={lokal.id} value={lokal.id}>
            {lokal.name}
          </option>
        ))}
      </select>
    )}

    <button
      onClick={() => zapiszEdycjePracownika(osoba)}
      style={{
        marginLeft: '10px',
      }}
    >
      💾 Zapisz
    </button>

    <button
      onClick={() => setEdycjaPracownikaId(null)}
      style={{
        marginLeft: '10px',
      }}
    >
      Anuluj
    </button>

  </div>
)}

{(
  pracownik.role === 'administrator' ||
  (
    pracownik.role === 'manager' &&
    ['employee', 'su-chef'].includes(osoba.role)
  )
) && (
  <>
    <button
      onClick={() => {
        setZmianaPinId(zmianaPinId === osoba.id ? null : osoba.id)
        setNowyPin('')
      }}
      style={{
        marginTop: '10px',
        marginLeft: '10px',
        padding: '8px 14px',
        cursor: 'pointer',
      }}
    >
      🔑 Zmień PIN
    </button>

    {zmianaPinId === osoba.id && (
      <div style={{ marginTop: '10px' }}>
        <input
          type="password"
          inputMode="numeric"
          placeholder={
  ['manager', 'administrator'].includes(osoba.role)
    ? 'Nowy PIN (6 cyfr)'
    : 'Nowy PIN (4–8 cyfr)'
}
          value={nowyPin}
          onChange={(e) => setNowyPin(e.target.value)}
        />

        <button onClick={() => zmienPinPracownika(osoba)}>
          Zapisz PIN
        </button>
      </div>
    )}
  </>
)}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
