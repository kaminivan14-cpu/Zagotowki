const quantity = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 10000
export function generatorPayload(lines, catalog, location, readyAt, prep) {
  const products = new Map(catalog.filter(p=>p.active && p.is_test).map(p=>[String(p.id),p]))
  let count = 0
  const mapLine = (line, parentQuantity = 1, child = false) => {
    if (!products.has(String(line.product_id)) || !quantity(line.quantity) || Number(line.quantity)*parentQuantity>10000 || !['product','addon','drink',...(child?[]:['set'])].includes(line.item_type)) throw new Error('INVALID_LINE')
    const result={product_id:Number(line.product_id),quantity:Number(line.quantity),item_type:line.item_type}
    if(line.item_type==='set') {
      if(!line.children?.length) throw new Error('EMPTY_SET')
      result.children=line.children.map(c=>mapLine(c,Number(line.quantity),true))
    } else count++
    return result
  }
  try {
    if(!Number.isSafeInteger(Number(location)) || Number(location)<1 || !lines.length || lines.length>50) return null
    const items=lines.map(line=>mapLine(line))
    if(count>50 || (prep!=='' && (!quantity(prep) || Number(prep)>1440)))return null
    if(readyAt && !Number.isFinite(Date.parse(readyAt)))return null
    return {location_id:Number(location),items,...(readyAt?{ready_at:new Date(readyAt).toISOString()}:{}),...(prep!==''?{estimated_prep_minutes:Number(prep)}:{})}
  } catch { return null }
}
