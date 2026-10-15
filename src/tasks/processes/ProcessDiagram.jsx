import {tr} from '../../i18n/runtime'
import {useEffect,useId,useMemo,useRef,useState} from 'react'
import {graphLayout,durationText,connectorPath,editDependency} from './model'
import {roleName} from '../admin/labels'

export default function ProcessDiagram({doc,selected,onSelect,onAddStage,disabled,employees=[],onSelectEdge,selectedEdge,onRewire,onConnect,onUndoEdge,canUndoEdge}){
 const [zoom,setZoom]=useState(1),[pan,setPan]=useState(false),[collapsed,setCollapsed]=useState([])
 const [rewiring,setRewiring]=useState(false),[hover,setHover]=useState(null),[message,setMessage]=useState('')
 const [connecting,setConnecting]=useState(null),[pointer,setPointer]=useState(null)
 const edgeDrag=useRef(null),suppressClick=useRef(false)
 const ref=useRef(),scroll=useRef(),drag=useRef(),handle=useRef(),marker=useId().replaceAll(':','')
 const graph=useMemo(()=>{try{return graphLayout(doc)}catch{return null}},[doc])
 const cancel=()=>{edgeDrag.current=null;setConnecting(null);setPointer(null);setRewiring(false);setHover(null);onSelectEdge?.(null)}
 useEffect(()=>{const escape=e=>{if(e.key==='Escape'&&(selectedEdge||connecting)){e.preventDefault();e.stopPropagation();edgeDrag.current=null;setConnecting(null);setPointer(null);setRewiring(false);setHover(null);onSelectEdge?.(null)}};document.addEventListener('keydown',escape,true);return()=>document.removeEventListener('keydown',escape,true)},[selectedEdge,onSelectEdge,connecting])
 if(!graph)return <p role="alert">{tr('Залежності містять цикл або невідоме завдання.')}</p>
 const {nodes,edges,width,height,terminalX}=graph,point=id=>nodes.find(t=>t.key===id)
 const active=selectedEdge&&edges.find(e=>e.from===selectedEdge.from&&e.to===selectedEdge.to)
 const editable=!!active&&!disabled&&!active.implicit&&!!onRewire
 const valid=key=>{if((!editable&&!connecting)||!key)return false;try{editDependency(doc,connecting?null:active,connecting||active.from,key,connecting?'add':'replace');return true}catch{return false}}
 const candidate=(x,y)=>document.elementFromPoint(x,y)?.closest('[data-task-key]')?.dataset.taskKey
 function finish(key){
  setRewiring(false);setHover(null);setPointer(null);setConnecting(null)
  if(!key)return
  if(!valid(key)){setMessage(tr(edges.some(e=>e.from===(connecting||active?.from)&&e.to===key)?'Такий зв’язок уже існує.':'Залежності не можуть утворювати коло.'));return}
  if(connecting)onConnect(connecting,key);else onRewire(active,key);setMessage('');onSelectEdge?.(null)
 }
 function selectEdge(edge){if(pan)return;setConnecting(null);setPointer(null);setMessage('');setRewiring(false);setHover(null);onSelectEdge?.(edge)}
 const track=e=>{const box=ref.current.querySelector('.process-graph-canvas').getBoundingClientRect();setPointer({x:(e.clientX-box.left)/zoom,y:(e.clientY-box.top)/zoom});setHover(candidate(e.clientX,e.clientY))}
 const selectable=!!onSelectEdge&&!pan
 const line=(edge,key,interactive=false)=>{
  const chosen=active?.from===edge.from&&active?.to===edge.to
  return <g key={key} className={`process-connector ${chosen?'is-selected':''}`}>
   <path className="process-connector-line" d={connectorPath(edge.points)} markerEnd={`url(#${marker})`}/>
   {interactive&&<path className="process-connector-hit" data-from={edge.from} data-to={edge.to} d={connectorPath(edge.points)} tabIndex={selectable?0:undefined} role={selectable?'button':undefined} aria-label={`${point(edge.from).number} → ${point(edge.to).number}`} aria-pressed={chosen} style={{pointerEvents:selectable?'stroke':'none'}} onPointerDown={e=>{if(!selectable||disabled||edge.implicit||!onRewire||e.button!==0)return;e.preventDefault();e.stopPropagation();selectEdge(edge);edgeDrag.current={x:e.clientX,y:e.clientY,moved:false};suppressClick.current=false;e.currentTarget.setPointerCapture(e.pointerId)}}
    onPointerMove={e=>{const start=edgeDrag.current;if(!start)return;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>4){start.moved=true;setRewiring(true);track(e)}}}
    onPointerUp={e=>{const start=edgeDrag.current;edgeDrag.current=null;if(!start?.moved)return;e.stopPropagation();suppressClick.current=true;finish(candidate(e.clientX,e.clientY))}}
    onPointerCancel={()=>{edgeDrag.current=null;setConnecting(null);setPointer(null);setRewiring(false);setHover(null)}}
    onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}selectEdge(edge)}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectEdge(edge)}}}/>}
  </g>
 }
 return <section className="process-diagram" ref={ref}>
  <div className="process-graph-tools">
   <button type="button" disabled={disabled} onClick={onAddStage}>{tr('＋ Додати етап')}</button>
   {onUndoEdge&&<button type="button" disabled={disabled||!canUndoEdge} onClick={()=>{cancel();setMessage('');onUndoEdge()}}>{tr('Скасувати зміну зв’язку')}</button>}
   <button type="button" aria-pressed={!pan} onClick={()=>setPan(false)}>{tr('Вибір')}</button>
   <button type="button" aria-pressed={pan} onClick={()=>{cancel();setPan(true)}}>{tr('Переміщення')}</button>
   <button type="button" aria-label={tr('Зменшити')} onClick={()=>setZoom(Math.max(.15,zoom-.1))}>−</button><output>{Math.round(zoom*100)}%</output>
   <button type="button" aria-label={tr('Збільшити')} onClick={()=>setZoom(Math.min(2,zoom+.1))}>＋</button>
   <button type="button" onClick={()=>setZoom(Math.max(.05,Math.min(1,(scroll.current.clientWidth-24)/width,Math.max(120,Math.min(scroll.current.clientHeight,window.innerHeight-scroll.current.getBoundingClientRect().top-100))/height)))}>{tr('Вмістити')}</button>
   <button type="button" onClick={()=>{cancel();setZoom(1);setCollapsed([])}}>{tr('Автовирівнювання')}</button>
   <button type="button" onClick={()=>{if(document.fullscreenElement)document.exitFullscreen();else ref.current.requestFullscreen?.()}}>{tr('На весь екран')}</button>
  </div>
  {message&&<p role="alert">{message}</p>}
  {editable&&<p className="process-rewire-help" role="status">{tr('Перетягніть кінець зв’язку на завдання. Enter — обрати картку, Escape — скасувати.')}</p>}
  <div ref={scroll} className={`process-graph-scroll ${pan?'is-pan':''}`} onClick={e=>{if(!e.target.closest('button,[data-task-key],.process-connector-hit'))cancel()}}
   onPointerDown={e=>{if(!pan)return;drag.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};e.currentTarget.setPointerCapture(e.pointerId)}}
   onPointerMove={e=>{if(!drag.current)return;e.currentTarget.scrollLeft=drag.current.left+drag.current.x-e.clientX;e.currentTarget.scrollTop=drag.current.top+drag.current.y-e.clientY}}
   onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} onLostPointerCapture={()=>{drag.current=null}}>
   <div style={{width:width*zoom,height:height*zoom}}><div className="process-graph-canvas" style={{width,height,transform:`scale(${zoom})`}}>
    <div className="process-terminal start" style={{left:terminalX-85}}>{tr('▶ Початок')}</div>
    {graph.bands.map(band=>{const stages=doc.stages.filter(s=>band.stageKeys.includes(s.key));return <div className={`process-graph-band stage-tone-${doc.stages.indexOf(stages[0])%4}`} key={band.key} data-stage-key={band.stageKeys[0]} style={{left:band.left,top:band.top,width:band.width,height:band.height}}><div className="process-band-heading">{stages.map(s=><div key={s.key}><strong>{doc.stages.indexOf(s)+1}. {s.name}</strong><small title={s.description}>{s.description} · {tr('{n} завдань',{n:s.tasks.length})}</small><button type="button" aria-label={tr('Згорнути {name}',{name:s.name})} aria-expanded={!collapsed.includes(s.key)} onClick={()=>setCollapsed(collapsed.includes(s.key)?collapsed.filter(k=>k!==s.key):[...collapsed,s.key])}>{collapsed.includes(s.key)?'⌄':'⌃'}</button></div>)}</div></div>})}
    <svg className="process-graph-edges" width={width} height={height} aria-label={tr('Зв’язки зверху вниз')}>
     <defs><marker id={marker} markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" viewBox="0 0 7 7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill="#36445e"/></marker></defs>
     {edges.map(e=>line(e,`${e.from}-${e.to}`,true))}
     {pointer&&(connecting||active)&&<path className="process-draft-connector" d={connectorPath([{x:point(connecting||active.from).x+125,y:point(connecting||active.from).y+88},pointer])} markerEnd={`url(#${marker})`}/>}
     {graph.startEdges.map(e=>line(e,`start-${e.to}`))}{graph.endEdges.map(e=>line(e,`end-${e.from}`))}
    </svg>
    {nodes.map(t=><button type="button" key={t.key} title={t.title} data-task-key={t.key} data-level={t.level} className={`process-graph-node ${selected===t.key?'selected':''} ${rewiring&&hover===t.key?(valid(t.key)?'rewire-valid':'rewire-invalid'):''}`} style={{left:t.x,top:t.y}}
     onPointerEnter={()=>{if(rewiring)setHover(t.key)}} onFocus={()=>{if(rewiring)setHover(t.key)}} onClick={()=>{if(pan)return;if(rewiring)finish(t.key);else{onSelectEdge?.(null);onSelect(t.key)}}}>
     <b>{t.number}　{t.icon||'▤'}　{t.title}</b>{!collapsed.includes(t.stageKey)&&<><small>{employees.find(e=>e.id===t.assigned_to_employee_id)?.name||roleName(t.responsible_role)}</small><small>◷ {durationText(t)}</small></>}
    </button>)}
    {selected&&!active&&!disabled&&!pan&&onConnect&&point(selected)&&<button type="button" className="process-edge-handle process-source-handle" aria-label={tr('Додати залежність')} title={tr('Додати залежність')} style={{left:point(selected).x+113,top:point(selected).y+88}}
     onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);setConnecting(selected);setRewiring(true);setMessage('')}}
     onPointerMove={e=>{if(connecting)track(e)}} onPointerUp={e=>{e.stopPropagation();if(connecting)finish(candidate(e.clientX,e.clientY))}} onPointerCancel={cancel}
     onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setConnecting(selected);setRewiring(true);setMessage('');ref.current.querySelector('[data-task-key]')?.focus()}}}>＋</button>}
    {editable&&<button ref={handle} type="button" className="process-edge-handle" aria-label={tr('Змінити наступне завдання')} aria-pressed={rewiring} style={{left:point(active.to).x+125-12,top:point(active.to).y-24}}
     onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);setRewiring(true);setHover(null);setMessage('')}}
     onPointerMove={e=>{if(!rewiring)return;track(e)}}
     onPointerUp={e=>{e.stopPropagation();if(rewiring)finish(candidate(e.clientX,e.clientY))}}
     onPointerCancel={()=>{setRewiring(false);setHover(null)}}
     onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setRewiring(true);setMessage('');ref.current.querySelector('[data-task-key]')?.focus()}}}>●</button>}
    <div className="process-terminal end" style={{left:terminalX-85,top:height-35}}>{tr('■ Завершення')}</div>
   </div></div>
  </div>
 </section>
}
