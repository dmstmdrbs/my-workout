self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data?.url || '/workout'
  const targetUrl = new URL(path, self.location.origin).href

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const appClient = clientList.find((client) => new URL(client.url).origin === self.location.origin)

    if (appClient) {
      await appClient.focus()

      // 이미 목표 화면에 있으면 이동하지 않는다. 같은 주소로 navigate()하면
      // 전체 리로드가 걸려, 기록 중이던 운동 화면이 처음부터 다시 뜬다.
      // 경로만 비교한다 -- /workout?programDay=... 처럼 쿼리가 붙어 있어도
      // 같은 화면이다.
      const isAlreadyThere = new URL(appClient.url).pathname === new URL(targetUrl).pathname
      if (isAlreadyThere) return

      if ('navigate' in appClient) {
        try {
          await appClient.navigate(targetUrl)
        } catch {
          // Focusing the installed app is still useful when navigation is unavailable.
        }
      }
      return
    }

    const openedClient = await self.clients.openWindow(targetUrl)
    await openedClient?.focus()
  })())
})
