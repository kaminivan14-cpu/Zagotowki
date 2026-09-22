import { useId, useState } from 'react'

export default function ProductCombobox({ produkty, ladowanie, blad, value, onChange }) {
  const id = useId()
  const [otwarte, setOtwarte] = useState(false)
  const [aktywny, setAktywny] = useState(-1)
  const [pokazWszystkie, setPokazWszystkie] = useState(false)
  const fraza = value.nazwa.trim().toLocaleLowerCase('pl-PL')
  const pasujace = produkty.filter((p) => pokazWszystkie || p.name.toLocaleLowerCase('pl-PL').includes(fraza))
  const opcje = pasujace.map((p) => ({ key: p.id, label: p.name, nazwa: p.name, product_external_id: p.external_id }))
  if (fraza && !produkty.some((p) => p.name.toLocaleLowerCase('pl-PL') === fraza)) {
    opcje.push({ key: 'custom', label: `Dodaj własną pozycję: „${value.nazwa.trim()}”`, nazwa: value.nazwa.trim(), product_external_id: null })
  }
  const wybierz = (opcja) => {
    onChange({ nazwa: opcja.nazwa, product_external_id: opcja.product_external_id ?? null })
    setOtwarte(false)
    setAktywny(-1)
  }
  const przesun = (index) => {
    setAktywny(index)
    document.getElementById(`${id}-option-${index}`)?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="product-combobox" onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOtwarte(false)
    }}>
      <label htmlFor={id}>Produkt</label>
      <input id={id} role="combobox" autoComplete="off"
        aria-autocomplete="list" aria-expanded={otwarte} aria-controls={`${id}-list`}
        aria-describedby={`${id}-help`}
        aria-activedescendant={otwarte && aktywny >= 0 && opcje[aktywny] ? `${id}-option-${aktywny}` : undefined}
        placeholder="Wyszukaj produkt lub wpisz własną nazwę"
        value={value.nazwa}
        onFocus={() => { setOtwarte(true); setPokazWszystkie(true); setAktywny(-1) }}
        onClick={() => setOtwarte(true)}
        onChange={(e) => {
          const nazwa = e.target.value
          const exact = produkty.filter((p) => p.name.toLocaleLowerCase('pl-PL') === nazwa.trim().toLocaleLowerCase('pl-PL'))
          onChange({ nazwa, product_external_id: exact.length === 1 ? exact[0].external_id ?? null : null })
          setPokazWszystkie(false)
          setOtwarte(true)
          setAktywny(-1)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOtwarte(false); setAktywny(-1) }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOtwarte(true)
            przesun(e.key === 'ArrowDown' ? Math.min(aktywny + 1, opcje.length - 1) : Math.max(aktywny - 1, 0))
          }
          if (e.key === 'Enter' && otwarte && opcje[aktywny]) {
            e.preventDefault()
            wybierz(opcje[aktywny])
          }
        }}
      />
      {otwarte && <ul id={`${id}-list`} role="listbox" aria-label="Produkty" className="product-combobox-options">
        {opcje.map((opcja, index) => <li key={opcja.key} id={`${id}-option-${index}`}
          role="option" aria-selected={aktywny === index}
          onMouseDown={(e) => e.preventDefault()} onClick={() => wybierz(opcja)}>
          {opcja.label}
        </li>)}
      </ul>}
      <small id={`${id}-help`}>Wybierz produkt z listy lub wpisz własną nazwę. Własna pozycja nie zmienia katalogu.</small>
      {ladowanie && <div role="status">Ładowanie katalogu produktów…</div>}
      {blad && <div role="alert">{blad} Możesz dodać własną pozycję.</div>}
      {!ladowanie && !blad && produkty.length === 0 && <div role="status">Katalog produktów jest pusty.</div>}
    </div>
  )
}
