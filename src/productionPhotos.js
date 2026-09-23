export const PHOTO_BUCKET = 'production-photos'
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const MAX_SOURCE_BYTES = 25 * 1024 * 1024
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function productionPhotoPath(planItemId, photoId) {
  const item = String(planItemId)
  if (!/^[1-9]\d*$/.test(item) ||
      (typeof planItemId === 'number' && !Number.isSafeInteger(planItemId)) || !uuid.test(photoId)) {
    throw new Error('Nieprawidłowy identyfikator pozycji lub zdjęcia.')
  }
  return `${item}/${photoId.toLowerCase()}.jpg`
}

export async function compressProductionPhoto(file) {
  if (!(file instanceof Blob) || !/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type)) {
    throw new Error('Wybierz zdjęcie JPEG, PNG, WebP, HEIC lub AVIF. Pliki SVG i inne typy nie są obsługiwane.')
  }
  if (!file.size || file.size > MAX_SOURCE_BYTES) {
    throw new Error('Zdjęcie jest puste lub przekracza 25 MB.')
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('Nie można odczytać zdjęcia. Spróbuj wybrać JPEG lub zrobić nowe zdjęcie.'))
      img.src = url
    })
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('Zdjęcie nie ma poprawnych wymiarów.')
    const ratio = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Ta przeglądarka nie obsługuje przygotowania zdjęcia.')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob || blob.type !== 'image/jpeg' || !blob.size || blob.size > MAX_PHOTO_BYTES) {
      throw new Error('Nie udało się zmniejszyć zdjęcia do 5 MB. Wybierz inne zdjęcie.')
    }
    return blob
  } finally {
    URL.revokeObjectURL(url)
    img.src = ''
  }
}

// An authenticated client must be supplied by feature/auth. This guard is UX only;
// Storage/table RLS must enforce permissions on the server. No PIN fallback.
async function requireUser(client) {
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user?.id) throw new Error('Zdjęcia wymagają aktywnej sesji Supabase Auth.')
  return data.user
}

export async function uploadProductionPhoto(client, { planItemId, photoId, blob }) {
  const path = productionPhotoPath(planItemId, photoId)
  if (!(blob instanceof Blob) || blob.type !== 'image/jpeg' || !blob.size || blob.size > MAX_PHOTO_BYTES) {
    throw new Error('Prześlij przygotowane zdjęcie JPEG o rozmiarze do 5 MB.')
  }
  await requireUser(client)
  const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg', upsert: false,
  })
  if (error) throw new Error('Nie udało się przesłać zdjęcia. Sprawdź połączenie i uprawnienia. Pozycja nie została zakończona.')
  // Upload alone never inserts metadata or completes a Plan_item.
  return { id: photoId.toLowerCase(), plan_item_id: planItemId, storage_path: path }
}

export async function listProductionPhotos(client, planItemId) {
  productionPhotoPath(planItemId, '00000000-0000-0000-0000-000000000000')
  await requireUser(client)
  const { data, error } = await client.from('Production_photos')
    .select('id, plan_item_id, storage_path, created_at')
    .eq('plan_item_id', planItemId).order('created_at', { ascending: false })
  if (error) throw new Error('Nie udało się pobrać informacji o zdjęciach.')
  return data || []
}

export async function getProductionPhotoUrl(client, photoId) {
  if (!uuid.test(photoId)) throw new Error('Nieprawidłowy identyfikator zdjęcia.')
  await requireUser(client)
  const { data, error } = await client.from('Production_photos')
    .select('id, plan_item_id, storage_path').eq('id', photoId).single()
  if (error || !data) throw new Error('Zdjęcie nie istnieje lub nie masz do niego dostępu.')
  if (data.storage_path !== productionPhotoPath(data.plan_item_id, data.id)) {
    throw new Error('Nieprawidłowa ścieżka zdjęcia.')
  }
  const result = await client.storage.from(PHOTO_BUCKET).createSignedUrl(data.storage_path, 60)
  if (result.error || !result.data?.signedUrl) throw new Error('Nie udało się otworzyć zdjęcia. Spróbuj ponownie.')
  return result.data.signedUrl
}

// Explicit user choice: an upload error must never silently switch to completion
// without a photo. These callbacks belong to the future Auth integration.
export async function submitProductionPhotoChoice({ blob = null, onConfirm, onSkip }) {
  if (blob === null) {
    if (typeof onSkip !== 'function') throw new Error('Zakończenie bez zdjęcia nie jest jeszcze podłączone.')
    return onSkip()
  }
  if (typeof onConfirm !== 'function') throw new Error('Zapis ze zdjęciem nie jest jeszcze podłączony.')
  return onConfirm(blob)
}
