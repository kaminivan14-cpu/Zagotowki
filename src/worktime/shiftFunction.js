export const shiftFunctions = ['prep','sushi','cutter']
export const canChooseShiftFunction = employee => ['su-chef','sushi-master','crafter'].includes(employee?.role)
export const shiftFunctionLabels = {
 pl:{label:'Funkcja',prep:'Zagotówkarz',sushi:'Sushi',cutter:'Krojenie',choose:'Wybierz funkcję',saving:'Zapisywanie…',cutting:'Do krojenia',prepHint:'Pracujesz jako Zagotówkarz. Zadania sushi są niedostępne; przejdź do Zagotówek lub zmień funkcję.'},
 uk:{label:'Функція',prep:'Заготовщик',sushi:'Сушист',cutter:'Нарезчик',choose:'Оберіть функцію',saving:'Збереження…',cutting:'До нарізки',prepHint:'Ви працюєте як Заготовщик. Дії сушиста недоступні; перейдіть до Заготівок або змініть функцію.'},
}
// Context restricts existing capabilities; it never grants any.
export function shiftCapabilities(capabilities,employee,shift) {
 if(!canChooseShiftFunction(employee))return capabilities
 if(shift?.current_shift_function==='prep')return capabilities.filter(c=>!['orders.work','orders.cut','orders.issue'].includes(c))
 if(shift?.current_shift_function==='cutter')return capabilities.filter(c=>c!=='orders.work')
 return capabilities
}
