// Helper to convert VAPID public key for web push
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Get backend API base URL from Vite environment variables
const API_URL = import.meta.env.VITE_API_BASE_URL || 'https://indus-school-hostel.onrender.com';

export async function subscribeUserToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push messaging is not supported by this browser.');
    return false;
  }

  try {
    // 1. Register or get the active service worker
    const registration = await navigator.serviceWorker.ready;

    // 2. Fetch the VAPID public key from your Render backend
    const res = await fetch(`${API_URL}/api/push/public-key`);
    const data = await res.json();
    
    if (!data.publicKey) {
      console.error('Failed to retrieve VAPID public key from server.');
      return false;
    }

    const convertedVapidKey = urlBase64ToUint8Array(data.publicKey);

    // 3. Subscribe the user in the browser
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });

    // 4. Send the subscription token to your Render backend to save in MongoDB
    const response = await fetch(`${API_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription),
    });

    if (!response.ok) {
      throw new Error('Failed to save subscription on the server.');
    }

    console.info('User successfully subscribed to push notifications!');
    return true;
  } catch (error) {
    console.error('Failed to subscribe the user to push notifications:', error);
    return false;
  }
}
