const { verifyFirebaseToken, verifyApiKey, getUserByFirebaseUid, parseBody, json } = require('../../lib/middleware');
const { query } = require('../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'DELETE') return json(res, 405, { error: 'Method not allowed' });

  const apiErr = verifyApiKey(req);
  if (apiErr) return json(res, apiErr.status, { error: apiErr.error });

  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const body = await parseBody(req);
  const fcmToken = body.fcm_token || body.fcmToken;

  if (fcmToken) {
    const user = await getUserByFirebaseUid(req.firebaseUid);
    if (!user) return json(res, 404, { error: 'User not found' });

    await query(
      `UPDATE user_notification_tokens SET active = false, updated_at = NOW()
       WHERE fcm_token = $1 AND user_id = $2`,
      [fcmToken, user.id]
    );
  }

  return json(res, 200, { message: 'Token unregistered successfully' });
};
