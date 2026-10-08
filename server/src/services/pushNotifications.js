const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

let vapidConfigured = false;

const configureVapid = () => {
  if (vapidConfigured) return true;

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
};

exports.getPublicKey = () => configureVapid() ? process.env.VAPID_PUBLIC_KEY : null;

exports.notifyNewRequest = async (request) => {
  if (!configureVapid()) {
    console.warn('Push notifications are disabled: configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.');
    return;
  }

  const subscriptions = await PushSubscription.find();
  const payload = JSON.stringify({
    title: 'New maintenance complaint',
    body: `${request.requestId}: ${request.category} — ${request.location}`,
    url: '/'
  });

  const results = await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: subscription.keys
      }, payload);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id });
        return;
      }
      throw err;
    }
  }));

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Push notification failed for subscription ${subscriptions[index]._id}:`, result.reason);
    }
  });
};
