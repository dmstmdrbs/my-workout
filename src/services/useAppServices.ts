import { useContext } from 'react'
import type { AppServices } from './contracts'
import { AppServicesContext } from './appServicesContext'

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext)
  if (!services) throw new Error('useAppServices must be rendered inside AppServicesProvider.')
  return services
}
