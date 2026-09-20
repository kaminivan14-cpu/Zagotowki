export default function LoginScreen({
  pin,
  setPin,
  bladLogowania,
  setBladLogowania,
  logowanie,
  zalogujPracownika,
}) {
  return (
    <div className="app">
      <header>
        <h1>ZAGOTÓWKI</h1>
        <p>Logowanie pracownika</p>
      </header>

      <main>
        <div className="produkt">
       <h2 style={{ color: '#1e293b' }}>
  🔐 Wpisz PIN
</h2>

          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              setBladLogowania('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                zalogujPracownika()
              }
            }}
            placeholder="PIN"
            autoFocus
            style={{
              width: '100%',
              height: '60px',
              padding: '0 18px',
              fontSize: '26px',
              textAlign: 'center',
              border: '1px solid #d1d5db',
              borderRadius: '12px',
              color: '#111827',
              background: '#ffffff',
            }}
          />

          {bladLogowania && (
            <p
              style={{
                color: '#dc2626',
                fontWeight: '600',
              }}
            >
              {bladLogowania}
            </p>
          )}

          <button
            className="zatwierdz"
            onClick={zalogujPracownika}
            disabled={logowanie}
          >
            {logowanie
              ? 'Logowanie...'
              : 'Zaloguj'}
          </button>
        </div>
      </main>
    </div>
  )
}
