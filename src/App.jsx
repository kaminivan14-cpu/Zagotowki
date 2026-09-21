import { useEffect, useRef, useState } from 'react'
import './App.css'
import LoginScreen from './components/LoginScreen'
import LocationSelectScreen from './components/LocationSelectScreen'
import NoPlanScreen from './components/NoPlanScreen'
import ScheduledPlansScreen from './components/ScheduledPlansScreen'
import EmployeesScreen from './components/EmployeesScreen'
import ProductionScreen from './components/ProductionScreen'
import HistoryScreen from './components/HistoryScreen'
import PlanningScreen from './components/PlanningScreen'
import { supabase } from './supabase'
import { pobierzKatalogProduktow } from './productCatalog'

const jednostki = ['g', 'kg', 'ml', 'l', 'szt.']

function App() {
  const [produkty, setProdukty] = useState([])
  const [ladowanieProduktow, setLadowanieProduktow] = useState(true)
  const [bladProduktow, setBladProduktow] = useState('')
  const [probaKatalogu, setProbaKatalogu] = useState(0)

  useEffect(() => {
    let aktywny = true
    pobierzKatalogProduktow().then((katalog) => {
      if (aktywny) setProdukty(katalog)
    }).catch(() => {
      if (aktywny) setBladProduktow('Nie udało się pobrać katalogu produktów.')
    }).finally(() => {
      if (aktywny) setLadowanieProduktow(false)
    })
    return () => { aktywny = false }
  }, [probaKatalogu])

const [pracownik, setPracownik] = useState(() => {
  try {
    const zapisany = JSON.parse(sessionStorage.getItem('pracownik') || 'null')
    return zapisany?.id && ['employee', 'manager', 'su-chef', 'administrator'].includes(zapisany.role)
      ? zapisany : null
  } catch {
    return null
  }
})
// Zmiana kontekstu unieważnia odpowiedzi poprzedniego ekranu/sesji.
const kontekst = useRef(0)
const blokadaLogowania = useRef(false)
const blokadaZapisu = useRef(false)
const blokadaDodawania = useRef(false)
const [pin, setPin] = useState('')
const [bladLogowania, setBladLogowania] = useState('')
const [logowanie, setLogowanie] = useState(false)

  const [ekran, setEkran] = useState('wybor-lokalu')

  const [lokale, setLokale] = useState([])
  const [wybranyLokal, setWybranyLokal] = useState(null)

  const [wybrane, setWybrane] = useState({})
  const [plan, setPlan] = useState([])
  const [pozycjeEdycji, setPozycjeEdycji] = useState([])
  const [planId, setPlanId] = useState(null)
  const [dataPlanu, setDataPlanu] = useState(() => {
  const jutro = new Date()
  jutro.setDate(jutro.getDate() + 1)

  return [
    jutro.getFullYear(),
    String(jutro.getMonth() + 1).padStart(2, '0'),
    String(jutro.getDate()).padStart(2, '0'),
  ].join('-')
})

  const [ladowanie, setLadowanie] = useState(true)
  const [zapisywanie, setZapisywanie] = useState(false)
const [, setTykanie] = useState(0)
const [historia, setHistoria] = useState([])
const [zaplanowanePlany, setZaplanowanePlany] = useState([])
const [ladowaniePlanow, setLadowaniePlanow] = useState(false)
const [sprawdzaniePlanu, setSprawdzaniePlanu] = useState(false)
const [komunikatNowegoPlanu, setKomunikatNowegoPlanu] = useState('')
const [ladowanieHistorii, setLadowanieHistorii] = useState(false)
const [otwartyDzien, setOtwartyDzien] = useState(null)
const [pracownicy, setPracownicy] = useState([])
const [ladowaniePracownikow, setLadowaniePracownikow] = useState(false)
const [pokazFormularzPracownika, setPokazFormularzPracownika] = useState(false)
const [nowyPracownik, setNowyPracownik] = useState({
  name: '',
  role: 'employee',
  location_id: '',
  pin: '',
})
const [zmianaPinId, setZmianaPinId] = useState(null)
const [nowyPin, setNowyPin] = useState('')
const [edycjaPracownikaId, setEdycjaPracownikaId] = useState(null)

const [edytowanyPracownik, setEdytowanyPracownik] = useState({
  name: '',
  role: 'employee',
  location_id: '',
})
const [pokazDodawaniePozycji, setPokazDodawaniePozycji] = useState(false)

const [nowaPozycja, setNowaPozycja] = useState({
  product_external_id: null,
  nazwa: '',
  ilosc: '',
  jednostka: 'kg',
  priorytet: 'normalny',
})
const [edycjaPozycjiId, setEdycjaPozycjiId] = useState(null)

const [edytowanaPozycja, setEdytowanaPozycja] = useState({
  product_external_id: null,
  nazwa: '',
  ilosc: '',
  jednostka: 'kg',
  priorytet: 'normalny',
})
  const wyczyscFormularzPozycji = () => {
    setEdycjaPozycjiId(null)
    setPokazDodawaniePozycji(false)
    setNowaPozycja({ product_external_id: null, nazwa: '', ilosc: '', jednostka: 'kg', priorytet: 'normalny' })
  }

  // -----------------------------------------
  // START APLIKACJI - POBIERAMY LOKALE
  // -----------------------------------------
const zalogujPracownika = async () => {
  if (blokadaLogowania.current) return
  const wersja = kontekst.current
  if (!pin.trim()) {
    setBladLogowania('Wpisz PIN')
    return
  }

  blokadaLogowania.current = true
  setLogowanie(true)
  setBladLogowania('')

  try {
    const { data, error } = await supabase.rpc(
      'login_employee',
      {
        p_pin: pin.trim(),
      }
    )

    if (wersja !== kontekst.current) return
    if (error) throw error

    if (!data || data.length === 0) {
      setBladLogowania('Nieprawidłowy PIN')
      return
    }

   const zalogowany = data[0]

setPracownik(zalogowany)

sessionStorage.setItem(
  'pracownik',
  JSON.stringify(zalogowany)
)

setPin('')
if (
  zalogowany.role !== 'administrator' &&
  zalogowany.location_id
) {
  const lokalPracownika = lokale.find(
    (lokal) => lokal.id === zalogowany.location_id
  )

  if (lokalPracownika) {
    await wybierzLokal(lokalPracownika, zalogowany)
  }
}

    console.log(
      'Zalogowany pracownik:',
      zalogowany
    )
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd logowania:', error)
    setBladLogowania('Nie udało się zalogować')
  } finally {
    blokadaLogowania.current = false
    setLogowanie(false)
  }
}
const wylogujPracownika = () => {
  kontekst.current += 1
  wyczyscFormularzPozycji()
  sessionStorage.removeItem('pracownik')
  setWybrane({})
  setHistoria([])
  setZaplanowanePlany([])
  setPracownicy([])
  setEdycjaPracownikaId(null)
  setZmianaPinId(null)
  setNowyPin('')
  setPokazFormularzPracownika(false)
  setNowyPracownik({ name: '', role: 'employee', location_id: '', pin: '' })
  setPracownik(null)
  setPin('')
  setBladLogowania('')
  setWybranyLokal(null)
  setPlanId(null)
  setPlan([])
  setEkran('wybor-lokalu')
}
const pobierzPracownikow = async () => {
  const wersja = kontekst.current
  if (!['administrator', 'manager'].includes(pracownik?.role)) return

  setLadowaniePracownikow(true)

  try {
const { data, error } = await supabase.rpc('get_employees', {
  p_requester_id: pracownik.id,
})

    if (wersja !== kontekst.current) return
    if (error) throw error

    setPracownicy(data || [])
    setEkran('pracownicy')
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd pobierania pracowników:', error)
    alert(`Nie udało się pobrać pracowników: ${error.message}`)
  } finally {
    setLadowaniePracownikow(false)
  }
}
const zapiszPracownika = async () => {
  const wersja = kontekst.current
  if (!nowyPracownik.name.trim()) {
    alert('Wpisz imię pracownika')
    return
  }

if (
  ['manager', 'administrator'].includes(nowyPracownik.role)
) {
  if (!/^\d{6}$/.test(nowyPracownik.pin)) {
    alert('PIN managera i administratora musi mieć dokładnie 6 cyfr')
    return
  }
} else {
  if (!/^\d{4,8}$/.test(nowyPracownik.pin)) {
    alert('PIN musi mieć od 4 do 8 cyfr')
    return
  }
}

  if (
    pracownik.role === 'administrator' &&
    nowyPracownik.role !== 'administrator' &&
    !nowyPracownik.location_id
  ) {
    alert('Wybierz lokal')
    return
  }

  try {
  const { error } = await supabase.rpc('create_employee', {
  p_requester_id: pracownik.id,
  p_name: nowyPracownik.name.trim(),
  p_role: nowyPracownik.role,
  p_location_id: nowyPracownik.location_id
    ? Number(nowyPracownik.location_id)
    : null,
  p_pin: nowyPracownik.pin,
})

    if (wersja !== kontekst.current) return
    if (error) throw error

    setNowyPracownik({
      name: '',
      role: 'employee',
      location_id: '',
      pin: '',
    })

    setPokazFormularzPracownika(false)

    await pobierzPracownikow()
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd dodawania pracownika:', error)
    alert(`Nie udało się dodać pracownika: ${error.message}`)
  }
}
const zmienStatusPracownika = async (osoba) => {
  const wersja = kontekst.current
  try {
    const nowyStatus = !osoba.active

    const { error } = await supabase.rpc('set_employee_active', {
      p_requester_id: pracownik.id,
      p_employee_id: osoba.id,
      p_active: nowyStatus,
    })

    if (wersja !== kontekst.current) return
    if (error) throw error

    await pobierzPracownikow()
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd zmiany statusu pracownika:', error)
    alert(`Nie udało się zmienić statusu: ${error.message}`)
  }
}
const zmienPinPracownika = async (osoba) => {
  const wersja = kontekst.current
if (
  ['manager', 'administrator'].includes(osoba.role)
) {
  if (!/^\d{6}$/.test(nowyPin)) {
    alert('PIN managera i administratora musi mieć dokładnie 6 cyfr')
    return
  }
} else {
  if (!/^\d{4,8}$/.test(nowyPin)) {
    alert('PIN musi mieć od 4 do 8 cyfr')
    return
  }
}

  try {
    const { error } = await supabase.rpc('change_employee_pin', {
      p_requester_id: pracownik.id,
      p_employee_id: osoba.id,
      p_new_pin: nowyPin,
    })

    if (wersja !== kontekst.current) return
    if (error) throw error

    setNowyPin('')
    setZmianaPinId(null)

    alert(`PIN pracownika ${osoba.name} został zmieniony`)
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd zmiany PIN-u:', error)
    alert(`Nie udało się zmienić PIN-u: ${error.message}`)
  }
}
const zapiszEdycjePracownika = async (osoba) => {
  const wersja = kontekst.current
  if (!edytowanyPracownik.name.trim()) {
    alert('Wpisz imię pracownika')
    return
  }

  try {
    const { error } = await supabase.rpc('update_employee', {
      p_requester_id: pracownik.id,
      p_employee_id: osoba.id,
      p_name: edytowanyPracownik.name.trim(),
      p_role: edytowanyPracownik.role,
      p_location_id: edytowanyPracownik.location_id
        ? Number(edytowanyPracownik.location_id)
        : null,
    })

    if (wersja !== kontekst.current) return
    if (error) throw error

    setEdycjaPracownikaId(null)

    setEdytowanyPracownik({
      name: '',
      role: 'employee',
      location_id: '',
    })

    await pobierzPracownikow()

    alert('Dane pracownika zostały zapisane')
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd edycji pracownika:', error)
    alert(`Nie udało się zapisać zmian: ${error.message}`)
  }
}
  useEffect(() => {
  const timer = setInterval(() => {
    setTykanie((wartosc) => wartosc + 1)
  }, 60000)

  return () => clearInterval(timer)
}, [])
useEffect(() => {
  if (!planId) return

  let aktywny = true
  let odczyt = 0

  const channel = supabase
    .channel(`plan-items-${planId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'Plan_items',
        filter: `plan_id=eq.${planId}`,
      },
      async () => {
        const numerOdczytu = ++odczyt
        const wersja = kontekst.current
        const { data, error } = await supabase
          .from('Plan_items')
          .select('*')
          .eq('plan_id', planId)
          .order('id', { ascending: true })

        if (!aktywny || numerOdczytu !== odczyt || wersja !== kontekst.current) return

        if (error) {
          console.error('Błąd Realtime:', error)
          return
        }

        setPlan(data || [])
      }
    )
    .subscribe()

  return () => {
    aktywny = false
    supabase.removeChannel(channel)
  }
}, [planId])

  useEffect(() => {
    const pobierzLokale = async () => {
    setLadowanie(true)

    try {
      const { data, error } = await supabase
        .from('Locations')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })

      if (error) throw error

      setLokale(data || [])
    } catch (error) {
      console.error('Błąd pobierania lokali:', error)

      alert(
        `Nie udało się pobrać lokali: ${error.message}`
      )
    } finally {
      setLadowanie(false)
    }
  }

    pobierzLokale()
  }, [])

  // -----------------------------------------
  // WYBÓR LOKALU
  // -----------------------------------------

 const wybierzLokal = async (lokal, aktualnyPracownik = pracownik) => {
  kontekst.current += 1
  wyczyscFormularzPozycji()
  const wersja = kontekst.current
  setWybranyLokal(lokal)

  setPlan([])
  setPlanId(null)
  setWybrane({})

  // Pracownik trafia bezpośrednio do planu na dziś
  if (aktualnyPracownik?.role === 'employee') {
    await pobierzPlan(lokal.id, aktualnyPracownik)
    return
  }

  // Manager / su-chef / administrator
  // trafiają do centrum planów
  setLadowaniePlanow(true)

  try {
    const dzisiaj = new Date()

    const dzisiejszaData = [
      dzisiaj.getFullYear(),
      String(dzisiaj.getMonth() + 1).padStart(2, '0'),
      String(dzisiaj.getDate()).padStart(2, '0'),
    ].join('-')

    const { data, error } = await supabase
      .from('Plans')
      .select(`
        id,
        plan_date,
        status,
        location_id,
        Plan_items (
          id
        )
      `)
      .eq('location_id', lokal.id)
      .eq('status', 'active')
      .gte('plan_date', dzisiejszaData)
      .order('plan_date', { ascending: true })
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })

    if (wersja !== kontekst.current) return
    if (error) throw error

    setZaplanowanePlany(data || [])
    setEkran('zaplanowane')
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error(
      'Błąd pobierania zaplanowanych planów:',
      error
    )

    alert(
      `Nie udało się pobrać planów: ${error.message}`
    )
  } finally {
    setLadowaniePlanow(false)
  }
}

  // -----------------------------------------
  // POBIERANIE PLANU DLA KONKRETNEGO LOKALU
  // -----------------------------------------

 const pobierzPlan = async (locationId, aktualnyPracownik = pracownik) => {
  const wersja = kontekst.current
  setLadowanie(true)

  try {
    // Pracownik zawsze dostaje plan na DZISIAJ.
    // Manager / su-chef / administrator pracują na wybranej dacie.
    let szukanaData

    if (aktualnyPracownik?.role === 'employee') {
      const dzisiaj = new Date()

      szukanaData = [
        dzisiaj.getFullYear(),
        String(dzisiaj.getMonth() + 1).padStart(2, '0'),
        String(dzisiaj.getDate()).padStart(2, '0'),
      ].join('-')
    } else {
      szukanaData = dataPlanu
    }

    const { data: plans, error: planError } =
      await supabase
        .from('Plans')
        .select('*')
        .eq('status', 'active')
        .eq('location_id', locationId)
        .eq('plan_date', szukanaData)
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(1)

    if (wersja !== kontekst.current) return
    if (planError) throw planError

    // Nie ma planu na wybraną datę
    if (!plans || plans.length === 0) {
      setPlan([])
      setPlanId(null)
      setWybrane({})

      if (
        ['administrator', 'manager', 'su-chef'].includes(
          aktualnyPracownik?.role
        )
      ) {
        setEkran('planowanie')
      } else {
        setEkran('brak-planu')
      }

      return
    }

    const aktywnyPlan = plans[0]

    const { data: items, error: itemsError } =
      await supabase
        .from('Plan_items')
        .select('*')
        .eq('plan_id', aktywnyPlan.id)
        .order('id', { ascending: true })

    if (wersja !== kontekst.current) return
    if (itemsError) throw itemsError

    setDataPlanu(aktywnyPlan.plan_date)
    setPlanId(aktywnyPlan.id)
    setPlan(items || [])
    setEkran('produkcja')
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd pobierania planu:', error)

    alert(
      `Nie udało się pobrać planu: ${error.message}`
    )

    setEkran('wybor-lokalu')
  } finally {
    if (wersja === kontekst.current) setLadowanie(false)
  }
}

  // -----------------------------------------
  // ZMIANA PRODUKTU
  // -----------------------------------------

  const zmienProdukt = (id, pole, wartosc) => {
    setWybrane((poprzednie) => ({
      ...poprzednie,

      [id]: {
        ...poprzednie[id],
        [pole]: wartosc,
      },
    }))
  }

  // W edycji istniejące pozycje mają własne klucze, snapshot nazwy i ID
  // z Plan_items. NULL pozostaje NULL, nawet jeśli nazwa pasuje do katalogu.
  const pozycjeKatalogowePlanu = new Set(
    pozycjeEdycji.filter((pozycja) => pozycja.product_external_id != null)
      .map((pozycja) => String(pozycja.product_external_id))
  )
  const produktyDoPlanowania = planId ? [
    ...pozycjeEdycji.map((pozycja) => ({
      id: `plan-item:${pozycja.id}`,
      name: pozycja.nazwa,
      external_id: pozycja.product_external_id ?? null,
    })),
    ...produkty.filter((produkt) => !pozycjeKatalogowePlanu.has(String(produkt.external_id))),
  ] : produkty

  // -----------------------------------------
  // ZAPIS PLANU
  // -----------------------------------------

  const zatwierdzPlan = async () => {
    if (blokadaZapisu.current || !dataPlanu) return
  const wersja = kontekst.current
    if (!wybranyLokal) {
      alert('Najpierw wybierz lokal.')
      return
    }

    if (ladowanieProduktow || bladProduktow) return

    const nowyPlan = produktyDoPlanowania
      .filter(
        (produkt) =>
          wybrane[produkt.id]?.aktywny
      )
      .map((produkt) => ({
        nazwa: produkt.name,
        product_external_id: produkt.external_id ?? null,

        ilosc: Number(
          wybrane[produkt.id]?.ilosc
        ),

        jednostka:
          wybrane[produkt.id]?.jednostka ||
          'kg',

        priorytet:
          wybrane[produkt.id]?.priorytet ||
          'normalny',

        gotowe: false,
      }))

    if (nowyPlan.length === 0) {
      alert('Wybierz przynajmniej jeden produkt.')
      return
    }

    const brakIlosci = nowyPlan.some(
      (produkt) =>
        !produkt.ilosc ||
        produkt.ilosc <= 0
    )

    if (brakIlosci) {
      alert(
        'Wpisz poprawną ilość dla każdego produktu.'
      )
      return
    }

    blokadaZapisu.current = true
    setZapisywanie(true)

    try {
      let aktualnyPlanId = planId

      // -------------------------------------
      // TWORZENIE NOWEGO PLANU
      // -------------------------------------

      if (!aktualnyPlanId) {
const planDate = dataPlanu

const { data: istniejacePlany, error: sprawdzenieError } = await supabase
  .from('Plans')
  .select('id, plan_date, status')
  .eq('location_id', wybranyLokal.id)
  .eq('plan_date', planDate)
  .order('created_at', { ascending: false, nullsFirst: false })
  .order('id', { ascending: false })
  .limit(1)

if (wersja !== kontekst.current) return
if (sprawdzenieError) throw sprawdzenieError

const istniejacyPlan = istniejacePlany?.[0]
if (istniejacyPlan) {
  if (istniejacyPlan.status === 'active') {
    if (window.confirm('Plan na ten dzień już istnieje\n\nCzy otworzyć istniejący plan?')) {
      await otworzZaplanowanyPlan(istniejacyPlan)
    }
  } else {
    alert('Plan na ten dzień już istnieje')
  }
  return
}

  const { data: nowyPlanId, error: planError } =
    await supabase.rpc('create_production_plan', {
      p_requester_id: pracownik.id,
      p_location_id: wybranyLokal.id,
      p_plan_date: planDate,
      p_items: nowyPlan.map((produkt) => ({
        product_external_id: produkt.product_external_id,
        nazwa: produkt.nazwa,
        ilosc: produkt.ilosc,
        jednostka: produkt.jednostka,
        priorytet: produkt.priorytet,
      })),
    })

  if (wersja !== kontekst.current) return
  if (planError?.code === '23505') {
    alert('Plan na ten dzień już istnieje.')
    return
  }
  if (planError) throw planError

// Otwieramy dokładnie plan utworzony przez RPC.
// RPC powinno zwrócić skalarne ID utworzonego rekordu.
if (
  !['number', 'string'].includes(typeof nowyPlanId) ||
  !String(nowyPlanId).trim()
) {
  setPlanId(null)
  setPlan([])
  setWybrane({})
  await pobierzZaplanowanePlany()
  alert('Plan został utworzony, ale serwer nie zwrócił jego ID. Otwórz go z listy planów; nie zapisuj go ponownie.')
  return
}

// Zachowujemy ID także wtedy, gdy odczyt pozycji się nie powiedzie.
setPlanId(nowyPlanId)
setPlan([])

const { data: pozycjeNowegoPlanu, error: itemsError } = await supabase
  .from('Plan_items')
  .select('*')
  .eq('plan_id', nowyPlanId)
  .order('id', { ascending: true })

if (wersja !== kontekst.current) return
if (itemsError) {
  alert(`Plan został utworzony, ale nie udało się pobrać jego pozycji: ${itemsError.message}. Otwórz go ponownie z listy planów.`)
  await pobierzZaplanowanePlany()
  return
}

setPlan(pozycjeNowegoPlanu || [])
setDataPlanu(planDate)
setWybrane({})
setEkran('produkcja')

return
} else {
  // -----------------------------------
  // EDYCJA ISTNIEJĄCEGO PLANU
  // -----------------------------------

  const { error: updateError } =
    await supabase.rpc('update_production_plan', {
      p_requester_id: pracownik.id,
      p_plan_id: aktualnyPlanId,
      p_items: nowyPlan.map((produkt) => ({
        product_external_id: produkt.product_external_id,
        nazwa: produkt.nazwa,
        ilosc: produkt.ilosc,
        jednostka: produkt.jednostka,
        priorytet: produkt.priorytet,
      })),
    })

  if (wersja !== kontekst.current) return
  if (updateError) throw updateError

  // RPC już zapisało nowe pozycje,
  // więc pobieramy aktualny plan z bazy.
  const { data: zapisanePozycje, error: itemsError } =
    await supabase
      .from('Plan_items')
      .select('*')
      .eq('plan_id', aktualnyPlanId)
      .order('id', { ascending: true })

  if (wersja !== kontekst.current) return
  if (itemsError) throw itemsError

  setPlan(zapisanePozycje || [])
  setEkran('produkcja')

  return
}

    } catch (error) {
    if (wersja !== kontekst.current) return
      console.error(
        'Błąd zapisu planu:',
        error
      )

      alert(
        `Nie udało się zapisać planu: ${error.message}`
      )
    } finally {
      blokadaZapisu.current = false
      setZapisywanie(false)
    }
  }

  // -----------------------------------------
  // GOTOWE / COFNIJ
  // -----------------------------------------
  const zapiszEdycjePozycji = async (produkt) => {
  const wersja = kontekst.current
  if (!edytowanaPozycja.nazwa.trim()) {
    alert('Wpisz nazwę produktu')
    return
  }

  const ilosc = Number(edytowanaPozycja.ilosc)

  if (!ilosc || ilosc <= 0) {
    alert('Wpisz poprawną ilość')
    return
  }

  try {
    const { error } = await supabase.rpc(
      'update_plan_item',
      {
        p_requester_id: pracownik.id,
        p_item_id: produkt.id,
        p_product_external_id: edytowanaPozycja.product_external_id ?? null,
        p_nazwa: edytowanaPozycja.nazwa.trim(),
        p_ilosc: ilosc,
        p_jednostka: edytowanaPozycja.jednostka,
        p_priorytet: edytowanaPozycja.priorytet,
      }
    )

    if (wersja !== kontekst.current) return
    if (error) throw error

    setPlan((poprzedniPlan) =>
      poprzedniPlan.map((element) =>
        element.id === produkt.id
          ? {
              ...element,
              product_external_id: edytowanaPozycja.product_external_id ?? null,
              nazwa: edytowanaPozycja.nazwa.trim(),
              ilosc,
              jednostka: edytowanaPozycja.jednostka,
              priorytet: edytowanaPozycja.priorytet,
            }
          : element
      )
    )

    setEdycjaPozycjiId(null)
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd edycji pozycji:', error)

    alert(
      `Nie udało się zapisać zmian: ${error.message}`
    )
  }
}
const usunPozycje = async (produkt) => {
  const wersja = kontekst.current
  const potwierdzenie = window.confirm(
    `Usunąć "${produkt.nazwa}" z planu?`
  )

  if (!potwierdzenie) return

  try {
    const { error } = await supabase.rpc(
      'delete_plan_item',
      {
        p_requester_id: pracownik.id,
        p_item_id: produkt.id,
      }
    )

    if (wersja !== kontekst.current) return
    if (error) throw error

    // Aktualizujemy ekran bez ponownego pobierania całego planu
    setPlan((poprzedniPlan) =>
      poprzedniPlan.filter(
        (element) => element.id !== produkt.id
      )
    )
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd usuwania pozycji:', error)

    alert(
      `Nie udało się usunąć pozycji: ${error.message}`
    )
  }
}
 const dodajPozycjeDoPlanu = async () => {
  if (blokadaDodawania.current) return
  const wersja = kontekst.current
  if (!planId) {
    alert('Brak aktywnego planu')
    return
  }

  if (!nowaPozycja.nazwa.trim()) {
    alert('Wpisz nazwę produktu')
    return
  }

  const ilosc = Number(nowaPozycja.ilosc)

  if (!ilosc || ilosc <= 0) {
    alert('Wpisz poprawną ilość')
    return
  }

  blokadaDodawania.current = true
  try {
    const { error } = await supabase.rpc('add_plan_item', {
      p_requester_id: pracownik.id,
      p_plan_id: planId,
      p_product_external_id: nowaPozycja.product_external_id ?? null,
      p_nazwa: nowaPozycja.nazwa.trim(),
      p_ilosc: ilosc,
      p_jednostka: nowaPozycja.jednostka,
      p_priorytet: nowaPozycja.priorytet,
    })

    if (wersja !== kontekst.current) return
    if (error) throw error

    // Zapis już się udał: nie pozostawiamy formularza do ponownego wysłania.
    wyczyscFormularzPozycji()
    const { data, error: refreshError } = await supabase
      .from('Plan_items')
      .select('*')
      .eq('plan_id', planId)
      .order('id', { ascending: true })

    if (wersja !== kontekst.current) return
    if (refreshError) {
      alert('Pozycja została dodana, ale odświeżenie nie powiodło się. Otwórz plan ponownie; nie dodawaj jej drugi raz.')
      return
    }

    setPlan(data || [])

    setNowaPozycja({
      product_external_id: null,
      nazwa: '',
      ilosc: '',
      jednostka: 'kg',
      priorytet: 'normalny',
    })

    setPokazDodawaniePozycji(false)
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd dodawania pozycji:', error)

    alert(
      `Nie udało się dodać pozycji: ${error.message}`
    )
  } finally {
    blokadaDodawania.current = false
  }
}
const rozpocznijPrace = async (id) => {
  const wersja = kontekst.current
  try {
    const { error } = await supabase.rpc(
      'start_plan_item',
      {
        p_requester_id: pracownik.id,
        p_item_id: id,
      }
    )

    if (wersja !== kontekst.current) return
    if (error) throw error

    const { data, error: refreshError } = await supabase
      .from('Plan_items')
      .select('*')
      .eq('id', id)
      .single()

    if (wersja !== kontekst.current) return
    if (refreshError) throw refreshError

    setPlan((poprzedniPlan) =>
      poprzedniPlan.map((element) =>
        element.id === id ? data : element
      )
    )
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd rozpoczęcia pracy:', error)

    alert(
      `Nie udało się rozpocząć pracy: ${error.message}`
    )
  }
}

const oznaczGotowe = async (id) => {
  const wersja = kontekst.current

  const produkt = plan.find(
    (element) => element.id === id
  )

  if (!produkt) return

  try {
    const { error } = await supabase.rpc(
      'complete_plan_item',
      {
        p_requester_id: pracownik.id,
        p_item_id: id,
      }
    )

    if (wersja !== kontekst.current) return
    if (error) throw error

    // Pobieramy dane zapisane przez bazę
    const { data, error: refreshError } = await supabase
      .from('Plan_items')
      .select('*')
      .eq('id', id)
      .single()

    if (wersja !== kontekst.current) return
    if (refreshError) throw refreshError

    setPlan((poprzedniPlan) =>
      poprzedniPlan.map((element) =>
        element.id === id ? data : element
      )
    )
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd zakończenia pracy:', error)

    alert(
      `Nie udało się zakończyć pracy: ${error.message}`
    )
  }
}
const obliczCzas = (startedAt, completedAt = null) => {
  if (!startedAt) return null

  const start = new Date(startedAt)
  const koniec = completedAt
    ? new Date(completedAt)
    : new Date()

  const sekundy = Math.max(
    0,
    Math.floor((koniec - start) / 1000)
  )

  if (sekundy < 60) {
    return `${sekundy} sek`
  }

  const minuty = Math.floor(sekundy / 60)
  const resztaSekund = sekundy % 60

  if (minuty < 60) {
    return `${minuty} min ${resztaSekund} sek`
  }

  const godziny = Math.floor(minuty / 60)
  const resztaMinut = minuty % 60

  return `${godziny} h ${resztaMinut} min`
}
const formatujGodzine = (data) => {
  if (!data) return '--:--:--'

  return new Date(data).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
  // -----------------------------------------
  // EDYCJA PLANU
  // -----------------------------------------

  const edytujPlan = () => {
  kontekst.current += 1
  wyczyscFormularzPozycji()
    if (ladowanieProduktow || bladProduktow) {
      alert('Katalog jest niedostępny. Edytuj poszczególne pozycje na ekranie produkcji lub ponów pobranie katalogu na ekranie planowania.')
      return
    }
    if (plan.some((produkt) => produkt.started_at || produkt.gotowe)) {
      alert('Ten plan zawiera rozpoczęte lub zakończone pozycje. Edytuj poszczególne pozycje na ekranie produkcji.')
      return
    }
    const daneDoEdycji = {}
    plan.forEach((produkt) => {
      daneDoEdycji[`plan-item:${produkt.id}`] = {
        aktywny: true,
        ilosc: produkt.ilosc,
        jednostka: produkt.jednostka,
        priorytet: produkt.priorytet,
      }
    })

    setPozycjeEdycji(plan)
    setWybrane(daneDoEdycji)
    setEkran('planowanie')
  }

  // -----------------------------------------
  // ZAKOŃCZENIE PLANU
  // -----------------------------------------

  const zakonczPlan = async () => {
  const wersja = kontekst.current
    const potwierdzenie =
      window.confirm(
        'Czy na pewno zakończyć dzisiejszy plan produkcji?'
      )

    if (
      !potwierdzenie ||
      !planId
    ) {
      return
    }

  const { error } = await supabase.rpc(
  'complete_production_plan',
  {
    p_requester_id: pracownik.id,
    p_plan_id: planId,
  }
)
    if (wersja !== kontekst.current) return
    if (error) {
      console.error(
        'Błąd zakończenia planu:',
        error
      )

      alert(
        `Nie udało się zakończyć planu: ${error.message}`
      )

      return
    }

    kontekst.current += 1
    wyczyscFormularzPozycji()
    setPlan([])
    setPlanId(null)
    setWybrane({})
    setEkran('planowanie')
  }

  // -----------------------------------------
// HISTORIA
// -----------------------------------------
const otworzZaplanowanyPlan = async (planZaplanowany) => {
  kontekst.current += 1
  wyczyscFormularzPozycji()
  const wersja = kontekst.current
  setLadowanie(true)

  try {
    const { data: items, error } = await supabase
      .from('Plan_items')
      .select('*')
      .eq('plan_id', planZaplanowany.id)
      .order('id', { ascending: true })

    if (wersja !== kontekst.current) return
    if (error) throw error

    setPlanId(planZaplanowany.id)
    setPlan(items || [])
    setDataPlanu(planZaplanowany.plan_date)
    setWybrane({})

    setEkran('produkcja')
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error(
      'Błąd otwierania zaplanowanego planu:',
      error
    )

    alert(
      `Nie udało się otworzyć planu: ${error.message}`
    )
  } finally {
    if (wersja === kontekst.current) setLadowanie(false)
  }
}

const pobierzZaplanowanePlany = async () => {
  const wersja = kontekst.current
  if (!wybranyLokal) return

  setLadowaniePlanow(true)

  try {
    // Dzisiejsza data YYYY-MM-DD
    const dzisiaj = new Date()

    const dzisiejszaData = [
      dzisiaj.getFullYear(),
      String(dzisiaj.getMonth() + 1).padStart(2, '0'),
      String(dzisiaj.getDate()).padStart(2, '0'),
    ].join('-')

    const { data, error } = await supabase
      .from('Plans')
      .select(`
        id,
        plan_date,
        status,
        location_id,
        Plan_items (
          id
        )
      `)
      .eq('location_id', wybranyLokal.id)
      .eq('status', 'active')
      .gte('plan_date', dzisiejszaData)
      .order('plan_date', { ascending: true })
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })

    if (wersja !== kontekst.current) return
    if (error) throw error

    setZaplanowanePlany(data || [])
    setEkran('zaplanowane')
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error(
      'Błąd pobierania zaplanowanych planów:',
      error
    )

    alert(
      `Nie udało się pobrać planów: ${error.message}`
    )
  } finally {
    setLadowaniePlanow(false)
  }
}
const pobierzHistorie = async () => {
  const wersja = kontekst.current
  if (!wybranyLokal) return

  setLadowanieHistorii(true)

  try {
    // 1. Pobieramy plany i zakończone pozycje
    const { data: plany, error: historiaError } = await supabase
      .from('Plans')
      .select(`
        *,
        Plan_items!inner (*)
      `)
      .eq('location_id', wybranyLokal.id)
      .eq('Plan_items.gotowe', true)
      .order('plan_date', { ascending: false })

    if (wersja !== kontekst.current) return
    if (historiaError) throw historiaError

    // 2. Zbieramy ID pracowników z historii
    const employeeIds = [
      ...new Set(
        (plany || [])
          .flatMap((plan) => plan.Plan_items || [])
          .map((item) => item.employee_id)
          .filter(Boolean)
      ),
    ]

    // 3. Pobieramy ich imiona
    let mapaPracownikow = {}

    if (employeeIds.length > 0) {
const { data: osoby, error: employeesError } = await supabase.rpc(
  'get_employee_names',
  {
    p_requester_id: pracownik.id,
    p_employee_ids: employeeIds,
  }
)

      if (wersja !== kontekst.current) return
      if (employeesError) throw employeesError

      mapaPracownikow = Object.fromEntries(
        (osoby || []).map((osoba) => [
          Number(osoba.id),
          osoba.name,
        ])
      )
    }

    // 4. Doklejamy imię do każdej pozycji
    const historiaZPracownikami = (plany || []).map((plan) => ({
      ...plan,

      Plan_items: (plan.Plan_items || []).map((item) => ({
        ...item,

        employee_name: item.employee_id
          ? mapaPracownikow[Number(item.employee_id)] || 'Brak danych'
          : 'Brak danych',
      })),
    }))
console.log('PLANY Z BAZY:', plany)
console.log('EMPLOYEE IDS:', employeeIds)
console.log('MAPA PRACOWNIKÓW:', mapaPracownikow)
console.log('GOTOWA HISTORIA:', historiaZPracownikami)

    setHistoria(historiaZPracownikami)
    setEkran('historia')
  } catch (error) {
    if (wersja !== kontekst.current) return
    console.error('Błąd pobierania historii:', error)

    alert(
      `Nie udało się pobrać historii: ${error.message}`
    )
  } finally {
    setLadowanieHistorii(false)
  }
}
  // -----------------------------------------
  // ZMIANA LOKALU
  // -----------------------------------------

  const zmienLokal = () => {
  kontekst.current += 1
  wyczyscFormularzPozycji()
    setWybranyLokal(null)
    setPlan([])
    setPlanId(null)
    setWybrane({})
    setEkran('wybor-lokalu')
  }

  const zmienDatePlanu = async (e) => {
  kontekst.current += 1
  wyczyscFormularzPozycji()
  const wersja = kontekst.current
      const nowaData = e.target.value
      if (!nowaData) return

      setDataPlanu(nowaData)

      // Czyścimy poprzedni plan przed pobraniem nowej daty
      setPlan([])
      setPlanId(null)
      setWybrane({})

      if (wybranyLokal) {
        setLadowanie(true)

        try {
          const { data: plans, error: planError } =
            await supabase
              .from('Plans')
              .select('*')
              .eq('status', 'active')
              .eq('location_id', wybranyLokal.id)
              .eq('plan_date', nowaData)
              .order('created_at', { ascending: false, nullsFirst: false })
              .order('id', { ascending: false })
              .limit(1)

          if (wersja !== kontekst.current) return
          if (planError) throw planError

          if (!plans || plans.length === 0) {
            setEkran('planowanie')
            return
          }

          const znalezionyPlan = plans[0]

          const { data: items, error: itemsError } =
            await supabase
              .from('Plan_items')
              .select('*')
              .eq('plan_id', znalezionyPlan.id)
              .order('id', { ascending: true })

          if (wersja !== kontekst.current) return
          if (itemsError) throw itemsError

          setPlanId(znalezionyPlan.id)
          setPlan(items || [])
          setEkran('produkcja')
        } catch (error) {
    if (wersja !== kontekst.current) return
          console.error(
            'Błąd zmiany daty planu:',
            error
          )

          alert(
            `Nie udało się pobrać planu: ${error.message}`
          )
        } finally {
          if (wersja === kontekst.current) setLadowanie(false)
        }
      }
    }

  // -----------------------------------------
  // ŁADOWANIE
  // -----------------------------------------

  if (ladowanie) {
    return (
      <div className="app">
        <header>
          <h1>ZAGOTÓWKI</h1>
          <p>Ładowanie...</p>
        </header>
      </div>
    )
  }

  // -----------------------------------------
  // EKRAN WYBORU LOKALU
  // -----------------------------------------
// -----------------------------------------
// EKRAN LOGOWANIA
// -----------------------------------------

if (!pracownik) {
  return (
    <LoginScreen
      pin={pin}
      setPin={setPin}
      bladLogowania={bladLogowania}
      setBladLogowania={setBladLogowania}
      logowanie={logowanie}
      zalogujPracownika={zalogujPracownika}
    />
  )
}
if (ekran === 'wybor-lokalu') {
  return (
    <LocationSelectScreen
      pracownik={pracownik}
      lokale={lokale}
      wylogujPracownika={wylogujPracownika}
      pobierzPracownikow={pobierzPracownikow}
      wybierzLokal={wybierzLokal}
    />
  )
}

  if (ekran === 'pracownicy') {
  return (
    <EmployeesScreen
      pracownik={pracownik}
      pokazFormularzPracownika={pokazFormularzPracownika}
      setPokazFormularzPracownika={setPokazFormularzPracownika}
      nowyPracownik={nowyPracownik}
      setNowyPracownik={setNowyPracownik}
      lokale={lokale}
      zapiszPracownika={zapiszPracownika}
      ladowaniePracownikow={ladowaniePracownikow}
      pracownicy={pracownicy}
      zmienStatusPracownika={zmienStatusPracownika}
      edycjaPracownikaId={edycjaPracownikaId}
      setEdycjaPracownikaId={setEdycjaPracownikaId}
      edytowanyPracownik={edytowanyPracownik}
      setEdytowanyPracownik={setEdytowanyPracownik}
      zapiszEdycjePracownika={zapiszEdycjePracownika}
      zmianaPinId={zmianaPinId}
      setZmianaPinId={setZmianaPinId}
      nowyPin={nowyPin}
      setNowyPin={setNowyPin}
      zmienPinPracownika={zmienPinPracownika}
      onPowrot={() => setEkran('wybor-lokalu')}
    />
  )
}

  // -----------------------------------------
  // EKRAN PRODUKCJI
  // -----------------------------------------

  if (ekran === 'produkcja') {
    const pozostalo = plan.filter(
      (produkt) => !produkt.gotowe
    ).length

    return (
      <ProductionScreen
        wybranyLokal={wybranyLokal}
        pozostalo={pozostalo}
        pracownik={pracownik}
        edytujPlan={edytujPlan}
        pokazDodawaniePozycji={pokazDodawaniePozycji}
        setPokazDodawaniePozycji={setPokazDodawaniePozycji}
        produkty={produkty}
        ladowanieProduktow={ladowanieProduktow}
        bladProduktow={bladProduktow}
        nowaPozycja={nowaPozycja}
        setNowaPozycja={setNowaPozycja}
        jednostki={jednostki}
        dodajPozycjeDoPlanu={dodajPozycjeDoPlanu}
        zmienLokal={zmienLokal}
        pobierzPracownikow={pobierzPracownikow}
        wylogujPracownika={wylogujPracownika}
        pobierzHistorie={pobierzHistorie}
        ladowanieHistorii={ladowanieHistorii}
        pobierzZaplanowanePlany={pobierzZaplanowanePlany}
        ladowaniePlanow={ladowaniePlanow}
        plan={plan}
        obliczCzas={obliczCzas}
        rozpocznijPrace={rozpocznijPrace}
        usunPozycje={usunPozycje}
        edycjaPozycjiId={edycjaPozycjiId}
        setEdycjaPozycjiId={setEdycjaPozycjiId}
        edytowanaPozycja={edytowanaPozycja}
        setEdytowanaPozycja={setEdytowanaPozycja}
        zapiszEdycjePozycji={zapiszEdycjePozycji}
        oznaczGotowe={oznaczGotowe}
        zakonczPlan={zakonczPlan}
      />
    )
  }
// -----------------------------------------
// EKRAN ZAPLANOWANYCH PLANÓW
// -----------------------------------------

if (ekran === 'zaplanowane') {
  return (
    <ScheduledPlansScreen
      wybranyLokal={wybranyLokal}
      zaplanowanePlany={zaplanowanePlany}
      dataPlanu={dataPlanu}
      sprawdzaniePlanu={sprawdzaniePlanu}
      komunikatNowegoPlanu={komunikatNowegoPlanu}
      onZmienDateNowegoPlanu={() => setKomunikatNowegoPlanu('')}
      otworzZaplanowanyPlan={otworzZaplanowanyPlan}
      onPowrot={() => {
        kontekst.current += 1
        setEkran(planId ? 'produkcja' : 'planowanie')
      }}
      onUtworzPlan={async (nowaData) => {
        if (!nowaData || !wybranyLokal || sprawdzaniePlanu) return
        setKomunikatNowegoPlanu('')
        if (zaplanowanePlany.some((p) =>
          p.location_id === wybranyLokal.id && p.plan_date === nowaData
        )) {
          setKomunikatNowegoPlanu('Plan na ten dzień już istnieje.')
          return
        }
        kontekst.current += 1
        const wersja = kontekst.current
        setSprawdzaniePlanu(true)

        try {
          const { data, error } = await supabase
            .from('Plans')
            .select('id')
            .eq('location_id', wybranyLokal.id)
            .eq('plan_date', nowaData)
            .limit(1)

          if (wersja !== kontekst.current) return
          if (error) throw error
          if (data?.length) {
            setKomunikatNowegoPlanu('Plan na ten dzień już istnieje.')
            return
          }

          wyczyscFormularzPozycji()
          setDataPlanu(nowaData)
          setPlanId(null)
          setPlan([])
          setWybrane({})
          setEkran('planowanie')
        } catch (error) {
          if (wersja !== kontekst.current) return
          setKomunikatNowegoPlanu(`Nie udało się sprawdzić, czy plan już istnieje: ${error.message}`)
        } finally {
          setSprawdzaniePlanu(false)
        }
      }}
    />
  )
}
  // -----------------------------------------
// EKRAN HISTORII
// -----------------------------------------

if (ekran === 'historia') {
  // Grupujemy wszystkie zakończone plany według dnia
  const historiaWedlugDni = historia.reduce((grupy, planHistorii) => {
    const data = planHistorii.plan_date

    if (!grupy[data]) {
      grupy[data] = []
    }

    grupy[data].push(planHistorii)

    return grupy
  }, {})

  return (
    <HistoryScreen
      wybranyLokal={wybranyLokal}
      historia={historia}
      historiaWedlugDni={historiaWedlugDni}
      otwartyDzien={otwartyDzien}
      setOtwartyDzien={setOtwartyDzien}
      formatujGodzine={formatujGodzine}
      obliczCzas={obliczCzas}
      onPowrot={() => setEkran(
        planId ? 'produkcja' : pracownik.role === 'employee' ? 'brak-planu' : 'planowanie'
      )}
    />
  )
}
// -----------------------------------------
// BRAK AKTYWNEGO PLANU - EMPLOYEE
// -----------------------------------------

if (
  ekran === 'brak-planu' &&
  pracownik?.role === 'employee'
) {
  return (
    <NoPlanScreen
      wybranyLokal={wybranyLokal}
      pracownik={pracownik}
      pobierzHistorie={pobierzHistorie}
      ladowanieHistorii={ladowanieHistorii}
      wylogujPracownika={wylogujPracownika}
    />
  )
}
  // -----------------------------------------
  // EKRAN PLANOWANIA
  // -----------------------------------------

  return (
    <PlanningScreen
      wybranyLokal={wybranyLokal}
      pracownik={pracownik}
      zmienLokal={zmienLokal}
      pobierzPracownikow={pobierzPracownikow}
      wylogujPracownika={wylogujPracownika}
      pobierzHistorie={pobierzHistorie}
      ladowanieHistorii={ladowanieHistorii}
      dataPlanu={dataPlanu}
      zmienDatePlanu={zmienDatePlanu}
      produkty={produktyDoPlanowania}
      ladowanieProduktow={ladowanieProduktow}
      bladProduktow={bladProduktow}
      ponowPobranieProduktow={() => {
        setLadowanieProduktow(true)
        setBladProduktow('')
        setProbaKatalogu((proba) => proba + 1)
      }}
      wybrane={wybrane}
      zmienProdukt={zmienProdukt}
      jednostki={jednostki}
      zatwierdzPlan={zatwierdzPlan}
      zapisywanie={zapisywanie}
    />
  )
}

export default App
