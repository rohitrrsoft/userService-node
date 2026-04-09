const { verifyFirebaseToken, verifyApiKey, getUserByFirebaseUid, json } = require('../../../lib/middleware');
const { query } = require('../../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const apiErr = verifyApiKey(req);
  if (apiErr) return json(res, apiErr.status, { error: apiErr.error });

  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  const tz = user.timezone || 'UTC';

  const result = await query(
    `SELECT COALESCE(SUM(intake_amount_ml), 0) AS total_ml
     FROM water_intake
     WHERE user_id = $1
       AND deleted_at IS NULL
       AND intake_timestamp >= (NOW() AT TIME ZONE $2)::date::timestamp AT TIME ZONE $2
       AND intake_timestamp < ((NOW() AT TIME ZONE $2)::date + INTERVAL '1 day')::timestamp AT TIME ZONE $2`,
    [user.id, tz]
  );

  const totalMl = parseFloat(result.rows[0].total_ml);
  return json(res, 200, totalMl);
};
