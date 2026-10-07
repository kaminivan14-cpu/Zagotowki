// Only a small explicit markup vocabulary; no styles, event handlers, images or executable URLs.
export function safeInstruction(html){
 const source=new DOMParser().parseFromString(html||'','text/html'),dest=document.createElement('div')
 const allowed=new Set(['P','BR','STRONG','B','EM','I','U','OL','UL','LI','A'])
 function copy(node,parent){
  if(node.nodeType===3){parent.append(document.createTextNode(node.textContent));return}
  if(node.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH'].includes(node.tagName))return
  const el=allowed.has(node.tagName)?document.createElement(node.tagName.toLowerCase()):document.createElement('span')
  if(node.tagName==='A'){try{const url=new URL(node.getAttribute('href'));if(['https:','http:','mailto:'].includes(url.protocol)){el.setAttribute('href',url.href);el.setAttribute('rel','noopener noreferrer')}}catch{/* invalid links become plain text */}}
  for(const child of node.childNodes)copy(child,el)
  parent.append(el)
 }
 for(const child of source.body.childNodes)copy(child,dest)
 return dest.innerHTML
}
