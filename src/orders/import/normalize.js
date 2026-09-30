// Source-neutral internal contract. A future authenticated adapter must map its
// provider payload into this shape; this is NOT an invented website/webhook API.
export function normalizeOrder(input, productMappings, locationMappings) {
  if (!input || typeof input.source !== 'string' || !input.source || typeof input.externalId !== 'string' || !input.externalId || !Array.isArray(input.items) || !input.items.length || input.items.length > 50) throw new Error('INVALID_PAYLOAD')
  const location = locationMappings.get(`${input.source}:${input.locationKey}`)
  if (!location) throw new Error('LOCATION_UNMAPPED')
  const items = input.items.map(item => {
    const product = productMappings.get(`${input.source}:${item.productKey}`)
    if (!product) throw new Error('PRODUCT_UNMAPPED')
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) throw new Error('INVALID_QUANTITY')
    return { product_id: product, quantity: item.quantity }
  })
  return { source: input.source, external_id: input.externalId, location_id: location, items }
}
