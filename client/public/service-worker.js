self.addEventListener('push', (event) => {
  let notification = {};
  if (event.data) {
    try {
      notification = event.data.json();
    } catch {
      notification = { body: event.data.text() };
    }
  }

  const options = {
    body: notification.body || 'A new maintenance complaint was submitted.',
    vibrate: [200, 100, 200], // Makes mobile phones vibrate when alert arrives
    tag: notification.tag || 'hostel-maintenance-alert', // Groups/manages notifications cleanly
    renotify: true,
    data: { url: notification.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(
      notification.title || 'Hostel maintenance update', 
      options
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    
    // Check if the app is already open in a tab or PWA shortcut window
    for (const client of clientList) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    
    // If not open, launch a new window from the shortcut context
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});