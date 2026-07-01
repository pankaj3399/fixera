// firebase-messaging-sw.js
// Handles background push notifications from FCM.
// Config is baked in at build time; FCMProvider may also refresh it via postMessage.

importScripts('/firebase-messaging-sw-config.js');
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js');

let messaging = null;

function initFirebase(config) {
  if (!config?.apiKey || !config?.projectId) return;

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }
    if (!messaging) {
      messaging = firebase.messaging();
      messaging.onBackgroundMessage((payload) => {
        const { title = 'Fixera', body = '' } = payload.notification || {};
        const data = payload.data || {};
        const clickUrl = data.clickUrl || '/';

        self.registration.showNotification(title, {
          body,
          icon: '/fixera-logo.png',
          badge: '/fixera-logo.png',
          data: { url: clickUrl, ...data },
          tag: data.type || 'fixera-notification',
          renotify: true,
        });
      });
    }
  } catch (err) {
    console.error('[FCM SW] Firebase init failed:', err);
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG') {
    initFirebase(event.data.config);
  }
});

if (self.__FIREBASE_CONFIG__) {
  initFirebase(self.__FIREBASE_CONFIG__);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      }),
  );
});
