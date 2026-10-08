const PushSubscription = require('../models/PushSubscription');
const pushNotifications = require('../services/pushNotifications');

exports.getPublicKey = (req, res) => {
  const publicKey = pushNotifications.getPublicKey();
  if (!publicKey) {
    return res.status(503).json({
      success: false,
      error: 'Phone notifications are not configured on the server.'
    });
  }

  res.json({ success: true, publicKey });
};

exports.subscribe = async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (typeof endpoint !== 'string' || !endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ success: false, error: 'A valid push subscription is required.' });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        userAgent: req.get('user-agent') || ''
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (typeof endpoint !== 'string' || !endpoint) {
      return res.status(400).json({ success: false, error: 'A valid subscription endpoint is required.' });
    }

    await PushSubscription.deleteOne({ endpoint });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
