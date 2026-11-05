const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

let vapidConfigured = false;
const MAX_SEND_ATTEMPTS = 3;

const sendWithRetry = async (subscription, payload) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await webpush.sendNotification(subscription, payload);
      return;
    } catch (err) {
      const statusCode = err.statusCode;
      const retryable = !statusCode || statusCode === 429 || statusCode >= 500;
      if (!retryable || attempt >= MAX_SEND_ATTEMPTS) throw err;

      await new Promise(resolve => setTimeout(resolve, 500 * (2 ** (attempt - 1))));
    }
  }
};

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
  if (subscriptions.length === 0) {
    console.info('Push notifications were not sent: no devices are subscribed.');
    return;
  }

  const payload = JSON.stringify({
    title: 'New maintenance complaint',
    body: `${request.requestId || 'REQ'}: ${request.category || 'General'} — ${request.location || 'Hostel'}`,
    tag: `maintenance-${request._id || request.requestId || Date.now()}`,
    url: '/'
  });

  const results = await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      // Safely structure the subscription object for web-push
      const pushSub = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys?.p256dh,
          auth: subscription.keys?.auth
        }
      };

      await sendWithRetry(pushSub, payload);
      return true;
    } catch (err) {
      console.error(`Detailed Push Error for sub ${subscription._id}:`, err.message, err.body || '');
      if (err.statusCode === 404 || err.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id });
        return false;
      }
      throw err;
    }
  }));

  const deliveredCount = results.filter(
    result => result.status === 'fulfilled' && result.value
  ).length;
  console.info(`Push notification delivery completed: ${deliveredCount}/${subscriptions.length} devices accepted the notification.`);

  results.forEach((result, index) => {
    const subscription = subscriptions[index];
    const userAgent = (subscription.userAgent || 'unknown').slice(0, 200);

    if (result.status === 'rejected') {
      console.error(
        `Push notification failed for subscription ${subscription._id}; user agent: ${userAgent}; status: ${result.reason?.statusCode || 'unknown'}`,
        result.reason?.message || result.reason
      );
    } else if (result.value) {
      console.info(
        `Push notification accepted for subscription ${subscription._id}; user agent: ${userAgent}`
      );
    } else {
      console.warn(
        `Expired push subscription removed: ${subscription._id}; user agent: ${userAgent}`
      );
    }
  });
};