self.addEventListener('push', (event) => {
  let notification = {};
  if (event.data) {
    try {
      notification = event.data.json();
    } catch {
      notification = { body: event.data.text() };
    }
  }

  event.waitUntil(self.registration.showNotification(notification.title || 'Hostel maintenance update', {
    body: notification.body || 'A new maintenance complaint was submitted.',
    icon: '/icons/maintenance.svg',
    badge: '/icons/maintenance.svg',
    data: { url: notification.url || '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appClient = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (appClient) {
      await appClient.navigate(targetUrl);
      return appClient.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
