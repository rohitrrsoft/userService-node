const { verifyFirebaseToken, getUserByFirebaseUid, parseBody, json } = require('../../lib/middleware');
const { query } = require('../../lib/db');

module.exports = async (req, res) => {

  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  if (req.method === 'GET') {
    const result = await query(
      'SELECT * FROM user_notification_preferences WHERE user_id = $1',
      [user.id]
    );

    if (result.rows.length === 0) {
      return json(res, 200, {
        enabled: true,
        frequencyPerDay: 6,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        timezone: user.timezone || 'UTC',
        messageTypes: ['hydration', 'motivation'],
      });
    }

    const pref = result.rows[0];
    return json(res, 200, {
      enabled: pref.enabled,
      frequencyPerDay: pref.frequency_per_day,
      quietHoursStart: pref.quiet_hours_start,
      quietHoursEnd: pref.quiet_hours_end,
      timezone: pref.timezone,
      messageTypes: pref.message_types ? pref.message_types.split(',') : ['hydration', 'motivation'],
    });
  }

  if (req.method === 'PUT') {
    const body = await parseBody(req);

    await query(
      `INSERT INTO user_notification_preferences
         (user_id, enabled, frequency_per_day, quiet_hours_start, quiet_hours_end, timezone, message_types, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         enabled = $2, frequency_per_day = $3, quiet_hours_start = $4,
         quiet_hours_end = $5, timezone = $6, message_types = $7, updated_at = NOW()`,
      [
        user.id,
        body.enabled,
        body.frequencyPerDay,
        body.quietHoursStart,
        body.quietHoursEnd,
        body.timezone,
        Array.isArray(body.messageTypes) ? body.messageTypes.join(',') : body.messageTypes,
      ]
    );

    return json(res, 200, { message: 'Preferences updated successfully' });
  }

  return json(res, 405, { error: 'Method not allowed' });
};
