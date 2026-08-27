self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data?.url || '/workout'
  const targetUrl = new URL(path, self.location.origin).href

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const appClient = clientList.find((client) => new URL(client.url).origin === self.location.origin)

    if (appClient) {
      await appClient.focus()
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
