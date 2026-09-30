import { useEffect, useState } from 'react'
import App from '../App'
import { supabase } from '../supabase'
import OrdersApp from './OrdersApp'
import './orders.css'
export default function ModuleShell({ pracownik, onSignOut }) {
  const [caps, setCaps] = useState(null), [module, setModule] = useState(null), [error, setError] = useState(false), [revision, setRevision] = useState(0)
  useEffect(() => {
    let alive = true
    supabase.rpc('auth_capabilities').then(({ data, error }) => {
      if (!alive) return
      if (error || !Array.isArray(data)) { setCaps(null); setError(true); return }
      setError(false); setCaps(data)
      if (!data.includes('orders.access') && data.includes('production.access')) setModule('production')
    }).catch(() => { if (alive) { setCaps(null); setError(true) } })
    return () => { alive = false }
  }, [pracownik, revision])
  if (error) return <div className="app"><p role="alert">Nie udało się sprawdzić uprawnień modułów.</p><button onClick={() => setRevision(x => x + 1)}>Ponów</button><button onClick={onSignOut}>Wyloguj</button></div>
  if (!caps) return <p role="status">Sprawdzanie modułów…</p>
  const production = caps.includes('production.access'), orders = caps.includes('orders.access')
  return <>{production && orders && module && <nav className="module-nav"><button onClick={() => setModule(null)}>Zmień moduł</button></nav>}
    {module === 'production' && production ? <App pracownik={pracownik} onSignOut={onSignOut} /> : module === 'orders' && orders ?
      <OrdersApp employee={pracownik} capabilities={caps} onSignOut={onSignOut} /> :
      <div className="app module-selector"><h1>Co robisz?</h1>
        {orders && <button onClick={() => setModule('orders')}>🍣 ZAMÓWIENIA<small>Realizacja bieżących zamówień</small></button>}
        {production && <button onClick={() => setModule('production')}>🥣 ZAGOTÓWKI<small>Produkcja / przygotowanie</small></button>}
        <button onClick={onSignOut}>Wyloguj</button>
      </div>}
  </>
}
