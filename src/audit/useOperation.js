import { useRef, useState } from 'react'
import { command } from './client'
import { errorLabel } from './model'
export default function useOperation() {
 const lock = useRef(false), retryTask = useRef(null)
 const [busy,setBusy] = useState(false), [error,setError] = useState('')
 async function perform(task, calls) {
  if(lock.current) return false
  lock.current = true; setBusy(true); setError(''); let index=0
  try {
   await task(async(action,args)=>{
    const i=index++
    calls[i] ||= { action,args,operation:crypto.randomUUID() }
    const c=calls[i]
    c.result ??= await command(c.action,c.args,c.operation)
    return c.result
   })
   retryTask.current=null; return true
  } catch(e) { setError(errorLabel(e)); retryTask.current=()=>perform(task,calls); return false }
  finally { lock.current=false; setBusy(false) }
 }
 return { busy,error,run:task=>perform(task,[]),retry:()=>retryTask.current?.(),clear:()=>{setError('');retryTask.current=null}, locked:()=>lock.current }
}
