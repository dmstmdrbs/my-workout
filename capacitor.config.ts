/// <reference types="@capacitor/local-notifications" />

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.trainlog.mobile',
  appName: 'Trainlog',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_trainlog',
      iconColor: '#3b82f6',
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
  },
}

export default config
