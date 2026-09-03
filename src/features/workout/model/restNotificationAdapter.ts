export interface RestNotificationAdapter {
  requestPermission(): Promise<boolean>
  sync(restEndsAt: number | null, enabled: boolean): Promise<void>
  notifyTimerFinished(enabled: boolean): Promise<void>
}
