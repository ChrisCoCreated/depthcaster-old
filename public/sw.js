// Service Worker for PWA Device Notifications
const CACHE_NAME = 'depthcaster-v1';

// Install event - cache static assets
// Don't skip waiting - let the new service worker wait until user confirms update
self.addEventListener('install', (event) => {
  // Service worker will wait until SKIP_WAITING message is received
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
    }).then(() => {
      // Notify all clients to initialize PWA tracking
      // This helps detect if PWA is installed
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        return Promise.all(
          clientList.map((client) => {
            return client.postMessage({ type: 'INITIALIZE_PWA_TRACKING' });
          })
        );
      });
    })
  );
  return self.clients.claim();
});

// Handle messages from main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { notification } = event.data;
    showNotification(notification);
  }
  
  // Handle skip waiting request (when user clicks refresh)
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Handle PWA tracking request from client
  if (event.data && event.data.type === 'TRACK_PWA_INSTALLED') {
    // Notify all clients to mark PWA as installed
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      clientList.forEach((client) => {
        client.postMessage({ type: 'MARK_PWA_INSTALLED' });
      });
    });
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

  // Check if this is a badge refresh push (lightweight notification to update badge)
  if (notificationData.data && notificationData.data.type === 'badge-refresh') {
    // Forward BADGE_REFRESH message to all clients to trigger immediate badge update
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        return Promise.all(
          clientList.map((client) => {
            return client.postMessage({ type: 'BADGE_REFRESH' });
          })
        );
      })
    );
    // Don't show a visible notification for badge refresh pushes
    return;
  }

  // For regular push notifications, show the notification
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

