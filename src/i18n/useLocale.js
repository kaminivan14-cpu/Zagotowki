import {useSyncExternalStore} from 'react'
import {getLocale,subscribe} from './runtime'
export function useLocale(){return useSyncExternalStore(subscribe,getLocale,getLocale)}
