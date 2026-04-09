const { verifyFirebaseToken, getUserByFirebaseUid, json } = require('../../../lib/middleware');
const { query } = require('../../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });


  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  const goalResult = await query(
    `SELECT * FROM water_goal WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );

  const activeGoal = goalResult.rows[0];
  const activeGoalMl = activeGoal ? activeGoal.goal_amount_ml : null;
  const hydrationGoal = activeGoalMl ? activeGoalMl / 1000.0 : null;

  return json(res, 200, { user, activeGoalMl, hydrationGoal });
};
