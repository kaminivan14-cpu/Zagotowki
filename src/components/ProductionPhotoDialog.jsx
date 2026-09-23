import { useEffect, useId, useRef, useState } from 'react'
import { compressProductionPhoto, submitProductionPhotoChoice } from '../productionPhotos'
import './ProductionPhotos.css'

// Mount when opened, unmount when closed. Callbacks await future authorized
// completion with a photo or explicitly without one. Cancel only closes the dialog.
export default function ProductionPhotoDialog({ productName, onClose, onConfirm, onSkip }) {
  const dialog = useRef(null)
  const version = useRef(0)
  const locked = useRef(false)
  const titleId = useId()
  const [blob, setBlob] = useState(null)
  const [preview, setPreview] = useState('')
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [retryPhoto, setRetryPhoto] = useState(false)
  const busy = phase !== 'idle'
  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => { version.current += 1; node.close() }
  }, [])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  async function selectPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || locked.current) return
    const current = ++version.current
    locked.current = true
    setPhase('preparing'); setError(''); setRetryPhoto(false); setBlob(null); setPreview('')
    try {
      const prepared = await compressProductionPhoto(file)
      if (version.current === current) {
        setPreview(URL.createObjectURL(prepared))
        setBlob(prepared)
      }
    } catch (failure) {
      if (version.current === current) setError(failure.message || 'Nie udało się przygotować zdjęcia.')
    } finally {
      if (version.current === current) { locked.current = false; setPhase('idle') }
    }
  }
  async function confirm(skip = false) {
    if (locked.current || (skip ? !onSkip : !blob || !onConfirm)) return
    const current = version.current
    locked.current = true
    setPhase(skip ? 'skipping' : 'sending'); setError(''); setRetryPhoto(false)
    try {
      await submitProductionPhotoChoice({ blob: skip ? null : blob, onConfirm, onSkip })
      if (version.current === current) onClose()
    } catch {
      if (version.current === current) {
        setRetryPhoto(!skip)
        setError(skip ? 'Nie udało się potwierdzić zakończenia bez zdjęcia. Spróbuj ponownie.'
          : 'Nie udało się potwierdzić zapisu ze zdjęciem. Spróbuj ponownie lub wybierz Pomiń zdjęcie.')
      }
    } finally {
      if (version.current === current) { locked.current = false; setPhase('idle') }
    }
  }
  return <dialog ref={dialog} className="production-photo-modal" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!locked.current) onClose() }}>
    <h2 id={titleId}>Zdjęcie gotowego produktu</h2>
    <p>{productName}</p>
    <p>Zdjęcie jest opcjonalne. Możesz zakończyć pozycję bez zdjęcia.</p>
    <label className="production-photo-picker">Zrób lub wybierz zdjęcie
      <input type="file" accept="image/*" capture="environment" disabled={busy} onChange={selectPhoto} />
    </label>
    {preview && <img className="production-photo-preview" src={preview} alt="Podgląd gotowego produktu" />}
    {busy && <p role="status">{phase === 'preparing' ? 'Przygotowywanie zdjęcia…' : phase === 'skipping' ? 'Potwierdzanie bez zdjęcia…' : 'Zapisywanie zdjęcia i potwierdzenia…'}</p>}
    {error && <p role="alert" className="production-photo-error">{error}</p>}
    {(!onConfirm || !onSkip) && <p>Potwierdzanie produkcji będzie dostępne po integracji z autoryzacją.</p>}
    <div className="production-photo-actions">
      <button type="button" disabled={busy} onClick={onClose}>Anuluj</button>
      <button type="button" disabled={busy || !onSkip} onClick={() => confirm(true)}>Pomiń zdjęcie</button>
      <button type="button" disabled={busy || !blob || !onConfirm} onClick={() => confirm(false)}>{retryPhoto ? 'Spróbuj ponownie' : 'Zatwierdź zdjęcie'}</button>
    </div>
  </dialog>
}
