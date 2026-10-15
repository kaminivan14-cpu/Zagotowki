import {useEffect} from 'react'
import {setLocale,tr} from './runtime'
import {useLocale} from './useLocale'
export default function LanguageSwitcher(){const locale=useLocale();useEffect(()=>{document.documentElement.lang=locale},[locale]);return <label className="language-switcher"><span>{tr('Мова')}</span><select aria-label={tr('Мова')} value={locale} onChange={e=>setLocale(e.target.value)}><option value="uk">Українська</option><option value="pl">Polski</option></select></label>}
