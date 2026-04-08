const { getMessaging } = require('./firebase');

/**
 * Send push notification to a single device.
 * Returns { success, messageId, error, invalidToken }
 */
async function sendNotification(fcmToken, title, body, data, platform) {
  try {
    const messageData = { ...(data || {}), title, body, timestamp: String(Date.now()) };

    const message = { token: fcmToken, data: messageData };

    if ((platform || '').toLowerCase() === 'android') {
      message.android = {
        priority: 'high',
        notification: { title, body, sound: 'default', channelId: 'hydration_channel' },
      };
    } else if ((platform || '').toLowerCase() === 'ios') {
      message.apns = {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            'content-available': 1,
          },
        },
      };
    }

    const messageId = await getMessaging().send(message);
    return { success: true, messageId, error: null, invalidToken: false };
  } catch (e) {
    const code = e.code || '';
    const invalidToken =
      code.includes('INVALID_ARGUMENT') ||
      code.includes('UNREGISTERED') ||
      code.includes('registration-token-not-registered');
    return { success: false, messageId: null, error: e.message, invalidToken };
  }
}

module.exports = { sendNotification };
