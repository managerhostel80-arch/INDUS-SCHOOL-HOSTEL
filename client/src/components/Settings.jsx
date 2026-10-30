import React from 'react';
import { subscribeUserToPush } from '../services/notifications';

export default function Settings() {
  
  const handleEnableNotifications = async () => {
    const success = await subscribeUserToPush();
    if (success) {
      alert('Notifications enabled successfully!');
    } else {
      alert('Could not enable notifications. Check console for details.');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Notification Settings</h2>
      <p>Enable push alerts to receive maintenance report updates on your device.</p>
      
      <button 
        onClick={handleEnableNotifications}
        style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
      >
        Enable Notifications
      </button>
    </div>
  );
}
