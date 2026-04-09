const { verifyFirebaseToken, getUserByFirebaseUid, parseBody, json } = require('../../lib/middleware');
const { query, transaction } = require('../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });


  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  const body = await parseBody(req);
  const { fcmToken, platform } = body;

  await transaction(async (client) => {
    // Check if token already exists
    const existing = await client.query(
      'SELECT * FROM user_notification_tokens WHERE fcm_token = $1',
      [fcmToken]
    );

    if (existing.rows.length > 0) {
      // Update existing token
      await client.query(
        `UPDATE user_notification_tokens
         SET user_id = $1, active = true, platform = $2, updated_at = NOW()
         WHERE fcm_token = $3`,
        [user.id, platform, fcmToken]
      );
    } else {
      // Deactivate old tokens for this user/platform
      await client.query(
        `UPDATE user_notification_tokens SET active = false, updated_at = NOW()
         WHERE user_id = $1 AND platform = $2 AND active = true`,
        [user.id, platform]
      );

      // Create new token
      await client.query(
        `INSERT INTO user_notification_tokens (user_id, fcm_token, platform, active, created_at, updated_at)
         VALUES ($1, $2, $3, true, NOW(), NOW())`,
        [user.id, fcmToken, platform]
      );
    }

    // Create default preferences if not exist
    const prefExists = await client.query(
      'SELECT 1 FROM user_notification_preferences WHERE user_id = $1',
      [user.id]
    );

    if (prefExists.rows.length === 0) {
      await client.query(
        `INSERT INTO user_notification_preferences
           (user_id, enabled, frequency_per_day, quiet_hours_start, quiet_hours_end, timezone, message_types, created_at, updated_at)
         VALUES ($1, true, 6, '22:00', '08:00', $2, 'hydration,motivation', NOW(), NOW())`,
        [user.id, user.timezone || 'UTC']
      );
    }
  });

  return json(res, 200, { message: 'Token registered successfully' });
};
