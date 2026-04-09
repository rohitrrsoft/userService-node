const { verifyFirebaseToken, verifyApiKey, getUserByFirebaseUid, json } = require('../../lib/middleware');
const { query } = require('../../lib/db');
const { sendNotification } = require('../../lib/fcm');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const apiErr = verifyApiKey(req);
  if (apiErr) return json(res, apiErr.status, { error: apiErr.error });

  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const messageType = url.searchParams.get('messageType') || 'hydration';

  // Get active tokens
  const tokensResult = await query(
    'SELECT * FROM user_notification_tokens WHERE user_id = $1 AND active = true',
    [user.id]
  );

  if (tokensResult.rows.length === 0) {
    return json(res, 400, { error: 'No active FCM tokens' });
  }

  const title = 'WaterNation 💧';
  const body = getNotificationBody(messageType);

  let successCount = 0;
  for (const token of tokensResult.rows) {
    const result = await sendNotification(
      token.fcm_token, title, body,
      { type: messageType, test: 'true' },
      token.platform
    );
    if (result.success) successCount++;

    // Log to history
    await query(
      `INSERT INTO notification_history (user_id, message, message_type, status, ai_generated, fcm_message_id, error_message, sent_at)
       VALUES ($1, $2, $3, $4, false, $5, $6, NOW())`,
      [user.id, body, messageType, result.success ? 'sent' : 'failed', result.messageId, result.error]
    );

    if (result.invalidToken) {
      await query(
        'UPDATE user_notification_tokens SET active = false, updated_at = NOW() WHERE id = $1',
        [token.id]
      );
    }
  }

  return json(res, 200, { message: `Sent to ${successCount}/${tokensResult.rows.length} tokens` });
};

function getNotificationBody(messageType) {
  const bodies = {
    hydration: '💧 Time to hydrate! Your body will thank you 💙',
    motivation: '🌟 You\'re doing amazing! Keep pushing forward 💪',
    workout: '🏋️ Great workout! Don\'t forget to rehydrate 💦',
    morning: '🌅 Good morning! Start your day with a glass of water ☀️',
    evening: '🌙 Evening hydration check! How are you doing? 💧',
    goal: '🎯 You\'re making great progress toward your goal! 🌊',
  };
  return bodies[messageType.toLowerCase()] || '💧 Stay hydrated! Drink some water 💙';
}
