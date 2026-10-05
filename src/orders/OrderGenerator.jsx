import { useState } from 'react'
import { labels as L } from './labels'
import { generatorPayload } from './generator'
const blank = () => ({key:crypto.randomUUID(),product_id:'',quantity:1,item_type:'product',children:[]})
export default function OrderGenerator({catalog, location, disabled, run}) {
 const [lines,setLines]=useState(()=>[blank()]),[readyAt,setReadyAt]=useState(''),[prep,setPrep]=useState('')
 const products=catalog.filter(p=>p.active && p.is_test)
 const payload=generatorPayload(lines,catalog,location,readyAt,prep)
 const update=(key,changes)=>setLines(old=>old.map(l=>l.key===key?{...l,...changes}:l))
 return <section className="order-generator"><h2>{L.generatorTitle}</h2><p>{L.generatorHelp}</p>
 <form onSubmit={async e=>{e.preventDefault();if(payload && await run('create_test',payload)){setLines([blank()]);setReadyAt('');setPrep('')}}}>
 <fieldset disabled={disabled}>
 {lines.map((line,index)=><section className="generator-line" key={line.key} aria-label={L.line(index+1)}>
  <div className="generator-fields"><label>{L.type}<select aria-label={L.type} value={line.item_type} onChange={e=>update(line.key,{item_type:e.target.value,children:[]})}>{Object.entries(L.itemTypes).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
  <ProductPicker products={products} value={line.product_id} label={line.item_type==='set'?L.setName:L.productName} onChange={id=>update(line.key,{product_id:id})}/>
  <label>{line.item_type==='set'?L.setCount:L.itemCount}<input type="number" required min="1" max="10000" step="1" value={line.quantity} onChange={e=>update(line.key,{quantity:e.target.value})}/></label>
  <button type="button" onClick={()=>setLines(old=>old.filter(l=>l.key!==line.key))}>{L.removeLine}</button></div>
  {line.item_type==='set' && <div className="generator-components"><h3>{L.composition}</h3><p>{L.perSetHint}</p>
   {line.children.map((child,n)=><div className="generator-component" key={child.key} aria-label={L.component(n+1)}>
    <ProductPicker products={products} label={L.componentProduct} value={child.product_id} onChange={id=>update(line.key,{children:line.children.map(c=>c.key===child.key?{...c,product_id:id}:c)})}/>
    <label>{L.type}<select aria-label={L.type} value={child.item_type} onChange={e=>update(line.key,{children:line.children.map(c=>c.key===child.key?{...c,item_type:e.target.value}:c)})}>{Object.entries(L.itemTypes).filter(([k])=>k!=='set').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>{L.perSet}<input type="number" required min="1" max="10000" step="1" value={child.quantity} onChange={e=>update(line.key,{children:line.children.map(c=>c.key===child.key?{...c,quantity:e.target.value}:c)})}/></label>
    <output>{L.total(Number(child.quantity)*Number(line.quantity))}</output>
    <button type="button" onClick={()=>update(line.key,{children:line.children.filter(c=>c.key!==child.key)})}>{L.removeComponent}</button>
   </div>)}
   <button type="button" onClick={()=>update(line.key,{children:[...line.children,blank()]})}>{L.addRoll}</button>
  </div>}
 </section>)}
 <button type="button" onClick={()=>setLines(old=>[...old,blank()])}>{L.addLine}</button>
 <label>{L.readyInput}<input type="datetime-local" value={readyAt} onChange={e=>setReadyAt(e.target.value)}/></label>
 <label>{L.prepInput}<input type="number" min="1" max="1440" step="1" value={prep} onChange={e=>setPrep(e.target.value)}/></label>
 {!payload && <p>{L.generatorInvalid}</p>}<button disabled={!payload}>{L.createOrder}</button>
 </fieldset></form></section>
}
function ProductPicker({products,value,onChange,label}) {
 const [search,setSearch]=useState('')
 const filtered=products.filter(p=>String(p.id)===String(value)||p.name.toLocaleLowerCase('pl').includes(search.toLocaleLowerCase('pl')))
 return <div className="generator-picker"><label>{L.searchProduct}<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>{label}<select aria-label={label} required value={value} onChange={e=>onChange(e.target.value)}><option value="">{L.chooseProduct}</option>{filtered.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
}
