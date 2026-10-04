// Source-neutral internal contract. A future authenticated adapter must map its
// provider payload into this shape; this is NOT an invented website/webhook API.
export function normalizeOrder(input, productMappings, locationMappings) {
  if (!input || typeof input.source !== 'string' || !input.source || typeof input.externalId !== 'string' || !input.externalId || !Array.isArray(input.items) || !input.items.length || input.items.length > 50) throw new Error('INVALID_PAYLOAD')
  const location = locationMappings.get(`${input.source}:${input.locationKey}`)
  if (!location) throw new Error('LOCATION_UNMAPPED')
  const mapItem = (item, child = false) => {
    const product = productMappings.get(`${input.source}:${item.productKey}`)
    if (!product) throw new Error('PRODUCT_UNMAPPED')
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) throw new Error('INVALID_QUANTITY')
    if (item.children !== undefined && (child || !Array.isArray(item.children) || !item.children.length || item.children.length > 50)) throw new Error('INVALID_SET')
    const children = item.children?.map(c => mapItem(c, true))
    if (children?.some(c => c.quantity * item.quantity > 10000)) throw new Error('INVALID_QUANTITY')
    return { product_id: product, quantity: item.quantity, ...(children ? { children } : {}) }
  }
  const items = input.items.map(item => mapItem(item))
  if (items.reduce((n,i)=>n+(i.children?.length || 1),0)>50) throw new Error('INVALID_ITEMS')
  const timing = {}
  if (input.ready_at != null) {
    if (typeof input.ready_at !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(input.ready_at) || !Number.isFinite(Date.parse(input.ready_at))) throw new Error('INVALID_READY_AT')
    timing.ready_at = new Date(input.ready_at).toISOString()
  }
  if (input.estimated_prep_minutes != null) {
    if (!Number.isInteger(input.estimated_prep_minutes) || input.estimated_prep_minutes<1 || input.estimated_prep_minutes>1440) throw new Error('INVALID_PREP_TIME')
    timing.estimated_prep_minutes = input.estimated_prep_minutes
  }
  return { source: input.source, external_id: input.externalId, location_id: location, items, ...timing }
}
