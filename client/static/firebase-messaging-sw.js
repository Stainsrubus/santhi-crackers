console.log('Service worker initializing...');

try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

  const firebaseConfig = {
    apiKey: 'AIzaSyDxkpAyYjGS_jC3abTHDfdAVozeUR_MKiU',
    authDomain: 'ecommerce-76923.firebaseapp.com',
    projectId: 'ecommerce-76923',
    storageBucket: 'ecommerce-76923.firebasestorage.app',
    messagingSenderId: '1075564064831',
    appId: '1:1075564064831:web:0e28c69c564ba6e9d4888a',
    measurementId: 'G-ZSPBRZFZ6N',
  };

  const app = firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  const processedNotifications = new Set();

  messaging.onBackgroundMessage((payload) => {
    console.log('Received background message:', payload);
    const messageId = payload.data?.id || `${payload.messageId}-${Date.now()}`;
    if (processedNotifications.has(messageId)) {
      console.log('Duplicate background notification ignored:', messageId);
      return;
    }
    processedNotifications.add(messageId);

    const notificationTitle = payload.notification?.title || 'Notification';
    const notificationOptions = {
      body: payload.notification?.body || '',
      icon: '/favicon1.png',
      badge: '/favicon1.png',
      data: payload.data,
      tag: messageId,
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/';
    event.waitUntil(clients.openWindow(url));
  });

  console.log('Service worker initialized successfully');
} catch (error) {
  console.error('Service worker initialization failed:', error);
}