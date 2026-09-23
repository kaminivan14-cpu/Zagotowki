import { useEffect, useId, useRef, useState } from 'react'
import './ProductionPhotos.css'

// loadSignedUrl is supplied by the integration, e.g. () => getProductionPhotoUrl(client, id).
export default function ProductionPhotoViewer({ productName, loadSignedUrl, onClose }) {
  const dialog = useRef(null)
  const titleId = useId()
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const current = result?.loader === loadSignedUrl && result?.attempt === attempt ? result : null
  const url = current?.url || ''
  const error = current?.error || ''
  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])
  useEffect(() => {
    let active = true
    Promise.resolve().then(() => loadSignedUrl()).then((signedUrl) => {
      if (!signedUrl) throw new Error('Brak adresu zdjęcia.')
      if (active) setResult({ loader: loadSignedUrl, attempt, url: signedUrl })
    }).catch(() => {
      if (active) setResult({ loader: loadSignedUrl, attempt, error: 'Nie udało się otworzyć zdjęcia. Sprawdź połączenie i uprawnienia.' })
    })
    return () => { active = false }
  }, [loadSignedUrl, attempt])
  return <dialog ref={dialog} className="production-photo-modal" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose() }}>
    <h2 id={titleId}>Zdjęcie — {productName}</h2>
    {!url && !error && <p role="status">Ładowanie zdjęcia…</p>}
    {url && !error && <img className="production-photo-preview" src={url} alt={`Gotowy produkt: ${productName}`}
      onError={() => setResult({ loader: loadSignedUrl, attempt, error: 'Nie udało się wczytać zdjęcia lub adres wygasł. Otwórz je ponownie.' })} />}
    {error && <><p role="alert" className="production-photo-error">{error}</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>Spróbuj ponownie</button></>}
    <button type="button" onClick={onClose}>Zamknij</button>
  </dialog>
}
