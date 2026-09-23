import test from 'node:test'
import assert from 'node:assert/strict'
import { productionPhotoPath, compressProductionPhoto, uploadProductionPhoto, getProductionPhotoUrl, submitProductionPhotoChoice } from '../src/productionPhotos.js'
const id = 'a0000000-0000-4000-8000-000000000001'

test('paths reject traversal and unsafe numeric IDs', () => {
  assert.equal(productionPhotoPath('12', id), `12/${id}.jpg`)
  for (const item of ['../12', '0', -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => productionPhotoPath(item, id))
  }
  assert.throws(() => productionPhotoPath('12', '../photo'))
})

test('invalid source files are rejected before decoding', async () => {
  await assert.rejects(compressProductionPhoto(new Blob(['svg'], { type: 'image/svg+xml' })))
  await assert.rejects(compressProductionPhoto(new Blob([], { type: 'image/jpeg' })))
})

test('missing Auth prevents Storage access; upload failure stays a rejection', async () => {
  const blob = new Blob(['image'], { type: 'image/jpeg' })
  const args = { planItemId: 12, photoId: id, blob }
  await assert.rejects(uploadProductionPhoto({ auth: { getUser: async () => ({ data: { user: null } }) } }, args), /Auth/)
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    storage: { from: () => ({ upload: async (path, body, options) => {
      assert.equal(path, `12/${id}.jpg`)
      assert.equal(body, blob)
      assert.equal(options.upsert, false)
      return { error: new Error('offline') }
    } }) },
  }
  await assert.rejects(uploadProductionPhoto(client, args), /nie została zakończona/)
})

test('an inconsistent metadata path is never signed', async () => {
  const query = { select: () => query, eq: () => query, single: async () => ({ data: {
    id, plan_item_id: 12, storage_path: `13/${id}.jpg`,
  } }) }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    from: () => query,
  }
  await assert.rejects(getProductionPhotoUrl(client, id), /ścieżka/)
})


test('explicit skip needs no image or Storage access and awaits completion', async () => {
  let completed = false
  const result = await submitProductionPhotoChoice({
    onConfirm: () => assert.fail('Skip must not upload'),
    onSkip: async () => { completed = true; return 'completed-without-photo' },
  })
  assert.equal(completed, true)
  assert.equal(result, 'completed-without-photo')
})

test('photo failure permits explicit retry or skip, never automatic completion', async () => {
  const blob = new Blob(['image'], { type: 'image/jpeg' })
  let skips = 0
  let attempts = 0
  const callbacks = {
    onConfirm: async () => { attempts++; throw new Error('offline') },
    onSkip: async () => { skips++; return 'completed' },
  }
  await assert.rejects(submitProductionPhotoChoice({ blob, ...callbacks }), /offline/)
  assert.equal(skips, 0)
  await assert.rejects(submitProductionPhotoChoice({ blob, ...callbacks }), /offline/)
  assert.equal(attempts, 2)
  assert.equal(await submitProductionPhotoChoice(callbacks), 'completed')
  assert.equal(skips, 1)
})

test('failed skip is not reported as successful completion', async () => {
  await assert.rejects(submitProductionPhotoChoice({ onSkip: async () => { throw new Error('offline') } }), /offline/)
  await assert.rejects(submitProductionPhotoChoice({}), /nie jest jeszcze podłączone/)
})
