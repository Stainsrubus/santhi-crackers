// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyC5UifPendA71qUWm74AUxawNrn_nI7ukk",
  authDomain: "firecrackers-4db7f.firebaseapp.com",
  projectId: "firecrackers-4db7f",
  storageBucket: "firecrackers-4db7f.firebasestorage.app",
  messagingSenderId: "141382182409",
  appId: "1:141382182409:web:26721a9a3d17374adf7ad8",
  measurementId: "G-RC2SM7V95S"
});

// Retrieve Firebase messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  const notificationTitle = payload.notification?.title || payload.data?.title || 'New Message';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'You have a new message',
    icon: payload.notification?.icon || payload.data?.icon || '/favicon.png',
    image: payload.notification?.image || payload.data?.image,
    data: payload.data || {},
    tag: payload.data?.id || `notification-${Date.now()}`,
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Open',
        icon: '/favicon.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/favicon.png'
      }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click received:', event);
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  // Handle notification click - open the app
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});

// Handle push events (backup for FCM)
self.addEventListener('push', (event) => {
  console.log('[firebase-messaging-sw.js] Push received:', event);
  
  if (event.data) {
    const payload = event.data.json();
    console.log('Push payload:', payload);
    
    const notificationTitle = payload.notification?.title || 'New Message';
    const notificationOptions = {
      body: payload.notification?.body || 'You have a new message',
      icon: payload.notification?.icon || '/favicon.png',
      data: payload.data || {},
      tag: payload.data?.id || `push-${Date.now()}`,
    };
    
    event.waitUntil(
      self.registration.showNotification(notificationTitle, notificationOptions)
    );
  }
});