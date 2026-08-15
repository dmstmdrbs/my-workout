import { useMemo, type PropsWithChildren } from 'react'
import type { AppServices } from './contracts'
import { supabase } from '../lib/supabase'
import { createLocalStorageServices } from './mock/localStorageServices'
import { createSupabaseServices } from './supabase/supabaseServices'
import { AppServicesContext } from './appServicesContext'

export function AppServicesProvider({ children, services }: PropsWithChildren<{ services?: AppServices }>) {
  const defaultServices = useMemo(
    () => supabase ? createSupabaseServices(supabase) : createLocalStorageServices(),
    [],
  )
  return <AppServicesContext.Provider value={services ?? defaultServices}>{children}</AppServicesContext.Provider>
}
