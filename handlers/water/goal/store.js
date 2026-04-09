const { verifyFirebaseToken, getUserByFirebaseUid, parseBody, json } = require('../../../lib/middleware');
const { transaction } = require('../../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });


  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  const body = await parseBody(req);
  const goalAmountMl = body.goalAmountMl;

  const result = await transaction(async (client) => {
    // Soft-delete previous active goal
    await client.query(
      `UPDATE water_goal SET deleted_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [user.id]
    );

    // Insert new goal
    const r = await client.query(
      `INSERT INTO water_goal (user_id, goal_amount_ml, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW()) RETURNING *`,
      [user.id, goalAmountMl]
    );

    return r.rows[0].goal_amount_ml;
  });

  return json(res, 201, result);
};
