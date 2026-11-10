const https = require('https');

const sendSms = (accountSid, authToken, from, to, body) => new Promise((resolve, reject) => {
  const postBody = new URLSearchParams({ To: to, From: from, Body: body }).toString();
  const request = https.request(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      auth: `${accountSid}:${authToken}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postBody)
      }
    },
    response => {
      response.resume();
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Twilio returned HTTP ${response.statusCode || 'unknown'}`));
        }
      });
    }
  );

  request.setTimeout(10000, () => request.destroy(new Error('Twilio request timed out')));
  request.on('error', reject);
  request.end(postBody);
});

exports.notifyNewRequest = async (request) => {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
  const recipients = (process.env.SMS_RECIPIENTS || '')
    .split(',')
    .map(number => number.trim())
    .filter(Boolean);

  if (recipients.length === 0) return;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.warn('SMS notifications are disabled: configure the Twilio credentials and sender number.');
    return;
  }

  const validRecipients = recipients.filter(number => /^\+[1-9]\d{7,14}$/.test(number));
  if (validRecipients.length !== recipients.length) {
    console.warn(`SMS notifications skipped ${recipients.length - validRecipients.length} invalid recipient number(s); use E.164 format.`);
  }

  const body = `New maintenance complaint ${request.requestId || 'REQ'}: ${request.category || 'General'} at ${request.location || 'Hostel'}. Urgency: ${request.urgencyLevel || 'Unspecified'}.`;
  const results = await Promise.allSettled(
    validRecipients.map(number => sendSms(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_PHONE_NUMBER,
      number,
      body
    ))
  );
  const deliveredCount = results.filter(result => result.status === 'fulfilled').length;

  console.info(`SMS notification delivery completed: ${deliveredCount}/${validRecipients.length} messages accepted.`);
  results.forEach(result => {
    if (result.status === 'rejected') {
      console.error('SMS notification delivery failed:', result.reason.message);
    }
  });
};