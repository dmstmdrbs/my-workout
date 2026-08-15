import { createContext } from 'react'
import type { AppServices } from './contracts'

export const AppServicesContext = createContext<AppServices | null>(null)
