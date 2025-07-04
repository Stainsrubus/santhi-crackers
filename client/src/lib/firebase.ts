import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { _axios } from '$lib/_axios';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC5UifPendA71qUWm74AUxawNrn_nI7ukk",
  authDomain: "firecrackers-4db7f.firebaseapp.com",
  projectId: "firecrackers-4db7f",
  storageBucket: "firecrackers-4db7f.firebasestorage.app",
  messagingSenderId: "141382182409",
  appId: "1:141382182409:web:26721a9a3d17374adf7ad8",
  measurementId: "G-RC2SM7V95S"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);
const db = getFirestore(app);

// Store processed notification IDs in memory
const processedNotifications = new Set();

export const requestForToken = async () => {
  console.log('requestForToken called');
  try {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return null;
    }

    // Check if service worker is supported
    if (!('serviceWorker' in navigator)) {
      console.warn('Service workers are not supported');
      return null;
    }

    // Request notification permission first
    console.log('Current permission:', Notification.permission);
    
    let permission = Notification.permission;
    if (permission === 'default') {
      console.log('Requesting notification permission');
      permission = await Notification.requestPermission();
      console.log('Permission result:', permission);
    }

    if (permission !== 'granted') {
      console.warn('Notification permission denied');
      return null;
    }

    // Register service worker
    console.log('Registering service worker');
    let registration;
    try {
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/',
      });
      console.log('Service Worker registered:', registration);
      
      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
      console.log('Service Worker is ready');
    } catch (swError) {
      console.error('Service Worker registration failed:', swError);
      return null;
    }

    // Get FCM token
    console.log('Getting FCM token');
    const currentToken = await getToken(messaging, {
      vapidKey: 'BD5H8_0fUg5f9y02BhTZigHiPI0ifwrHiaoFlL-uxZpzzEnaW1yIoMNWvkodVau7hMwVsUpAeWNq7is9T-bTvqE',
      serviceWorkerRegistration: registration,
    });

    if (currentToken) {
      console.log('FCM token obtained:', currentToken);

      // Send token to backend
      const token = localStorage.getItem('token');
      if (token) {
        console.log('Sending FCM token to backend');
        try {
          const res = await _axios.post(
            '/user/updateFcm',
            { fcmToken: currentToken },
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          console.log('FCM token updated successfully:', res.data);
          return { token: currentToken, response: res };
        } catch (error) {
          console.error('Error updating FCM token:', error);
          return { token: currentToken, error };
        }
      } else {
        console.warn('No auth token available to update FCM token');
        return { token: currentToken };
      }
    } else {
      console.warn('No registration token available');
      return null;
    }
  } catch (error) {
    console.error('Error in requestForToken:', error);
    if (error.code === 'messaging/unsupported-browser') {
      console.error('Browser may not support FCM');
    } else if (error.code === 'messaging/permission-blocked') {
      console.error('Notification permission blocked');
    }
    return null;
  }
};

// Handle foreground messages
export const onMessageListener = () => {
  console.log('Setting up foreground message listener');
  
  onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload);

    // Generate a unique ID for this notification
    const messageId = payload.data?.id || `${payload.messageId}-${Date.now()}`;

    // Check if we've already processed this notification
    if (processedNotifications.has(messageId)) {
      console.log('Duplicate notification ignored:', messageId);
      return;
    }

    // Mark this notification as processed
    processedNotifications.add(messageId);

    // Show notification if app is in foreground and permission is granted
    if (document.visibilityState === 'visible' && Notification.permission === 'granted') {
      const notification = new Notification(payload.notification?.title || 'New Message', {
        body: payload.notification?.body || 'You have a new message',
        icon: payload.notification?.icon || '/favicon.png',
        // image: payload.notification?.image,
        data: payload.data || {},
        tag: messageId,
        requireInteraction: true, // Keep notification until user interacts
      });

      // Handle notification click
      notification.onclick = (event) => {
        console.log('Notification clicked:', event);
        event.preventDefault();
        notification.close();
        
        // Handle the click action (e.g., open a specific page)
        if (payload.data?.url) {
          window.open(payload.data.url, '_blank');
        } else {
          window.focus();
        }
      };

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);
    }
  });
};

// Initialize messaging when the module loads
if (typeof window !== 'undefined') {
  // Set up the message listener immediately
  onMessageListener();
  
  // Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    console.log('Page visibility changed:', document.visibilityState);
  });
}

export { db, messaging };