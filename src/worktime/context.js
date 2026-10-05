import {createContext,useContext} from 'react'
export const WorktimeContext=createContext(null)
export const useWorktime=()=>useContext(WorktimeContext)
