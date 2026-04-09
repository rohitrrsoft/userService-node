const { verifyFirebaseToken, verifyApiKey, getUserByFirebaseUid, parseBody, json } = require('../../../lib/middleware');
const { query } = require('../../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const apiErr = verifyApiKey(req);
  if (apiErr) return json(res, apiErr.status, { error: apiErr.error });

  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  const body = await parseBody(req);
  const amountMl = body.amountMl;
  const timestamp = body.timestamp || new Date().toISOString();

  const result = await query(
    `INSERT INTO water_intake (user_id, intake_amount_ml, intake_timestamp, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *`,
    [user.id, amountMl, timestamp]
  );

  return json(res, 201, result.rows[0]);
};
