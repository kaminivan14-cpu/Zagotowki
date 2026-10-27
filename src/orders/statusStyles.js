const palette=(background,color,border)=>({background,color,border:`1px solid ${border}`})
export const orderStatusStyles = {
 NEW:palette('#dbeafe','#1e3a8a','#93c5fd'),
 TO_DO:palette('#e0e7ff','#312e81','#a5b4fc'),
 IN_PROGRESS:palette('#ffedd5','#7c2d12','#fdba74'),
 READY_FOR_CUTTING:palette('#ccfbf1','#115e59','#5eead4'),
 CUTTING:palette('#fae8ff','#701a75','#e879f9'),
 COMPLETED:palette('#d1fae5','#064e3b','#6ee7b7'),
 ready_to_issue:palette('#dcfce7','#166534','#86efac'),
 'lifecycle:new':palette('#f1f5f9','#334155','#cbd5e1'),
 'lifecycle:partial':palette('#ede9fe','#5b21b6','#c4b5fd'),
 'lifecycle:in_progress':palette('#ffedd5','#7c2d12','#fdba74'),
 'lifecycle:done':palette('#d1fae5','#064e3b','#6ee7b7'),
}
const fallback=palette('#f1f5f9','#334155','#cbd5e1')
export const orderStatusStyle=status=>orderStatusStyles[status]||fallback
export const orderStatusLabels={
 pl:{NEW:'Nowe',TO_DO:'Do zrobienia',IN_PROGRESS:'W trakcie',READY_FOR_CUTTING:'Do krojenia',CUTTING:'Krojenie',COMPLETED:'Wydane',ready_to_issue:'Do wydania','lifecycle:new':'Oczekujące','lifecycle:partial':'Częściowo przejęte','lifecycle:in_progress':'W realizacji','lifecycle:done':'Zakończone'},
 uk:{NEW:'Нове',TO_DO:'До виконання',IN_PROGRESS:'У роботі',READY_FOR_CUTTING:'До нарізки',CUTTING:'Нарізка',COMPLETED:'Видано',ready_to_issue:'До видачі','lifecycle:new':'Очікує','lifecycle:partial':'Частково взято','lifecycle:in_progress':'Виконується','lifecycle:done':'Завершено'},
}
