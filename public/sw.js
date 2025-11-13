// Service Worker for PWA Device Notifications
const CACHE_NAME = 'depthcaster-v1';

// Install event - cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim();
});

// Handle notification display requests from main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { notification } = event.data;
    showNotification(notification);
  }
});

// Show notification
function showNotification(notificationData) {
  const { title, body, icon, badge, data, tag } = notificationData;
  
  const notificationOptions = {
    body,
    icon: icon || '/icon-192x192.webp',
    badge: badge || '/icon-96x96.webp',
    tag: tag || 'depthcaster-notification',
    data: data || {},
    requireInteraction: false,
    silent: false,
  };

  return self.registration.showNotification(title, notificationOptions);
}

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { data } = event.notification;
  const urlToOpen = data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle push events (for cross-device notifications)
self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'Depthcaster',
    body: 'You have a new notification',
    icon: '/icon-192x192.webp',
    badge: '/icon-96x96.webp',
    data: { url: '/' },
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        data: data.data || notificationData.data,
      };
    } catch (e) {
      console.error('Error parsing push data:', e);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      data: notificationData.data,
      tag: `push-${Date.now()}`,
      requireInteraction: false,
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  // Could track notification dismissal here if needed
  console.log('Notification closed:', event.notification.tag);
});

