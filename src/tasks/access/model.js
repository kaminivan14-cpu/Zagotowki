// Presentation mapping from actual capability names, never from role names.
// Tasks tabs are all readable once tasks.access is present; actions remain scoped.
export const accessModules=[
 ['work','Робота',c=>c.has('tasks.access')],['planning','Планування',c=>c.has('tasks.access')],['reports','Звіти',c=>c.has('tasks.access')],['schedule','Графік',c=>c.has('tasks.access')],
 ['admin','Адмін панель',c=>c.has('tasks.access')&&c.has('tasks.admin')],['processes','Процеси',c=>c.has('tasks.access')&&c.has('tasks.admin')&&c.has('processes.read')],
 ['orders','Замовлення',c=>c.has('orders.access')],['worktime','Час роботи',c=>c.has('worktime.access')],['production','Заготівки',c=>c.has('production.access')],
]
export const moduleStates=capabilities=>accessModules.map(([id,label,allowed])=>({id,label,allowed:Array.isArray(capabilities)?allowed(new Set(capabilities)):null}))
export const capabilityGroup=code=>code.startsWith('tasks.')?'Робота':code.startsWith('orders.')?'Замовлення':code.startsWith('production.')?'Заготівки':code.startsWith('worktime.')?'Час роботи':code.startsWith('processes.')?'Процеси':'Адміністрування'

export const roleSummary=capabilities=>{
 if(!Array.isArray(capabilities))return 'Дозволи не перевірено'
 if(!capabilities.length)return 'Дозволів не призначено'
 const c=new Set(capabilities)
 if(c.has('tasks.admin'))return 'Адміністрування роботи та доступ до модулів нижче.'
 if(['tasks.assign','tasks.plan.scope','tasks.read.scope'].some(p=>c.has(p)))return 'Робота з командою в межах призначеної області доступу.'
 return 'Робота в доступних модулях; дії залежать від дозволів та області доступу.'
}
