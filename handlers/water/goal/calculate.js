const { verifyFirebaseToken, getUserByFirebaseUid, parseBody, json } = require('../../../lib/middleware');
const { query } = require('../../../lib/db');
const { calculateHydrationGoal } = require('../../../lib/water-intake-util');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });


  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  const body = await parseBody(req);

  const goalLiters = calculateHydrationGoal({
    weightLbs: body.weightLbs,
    activityLevel: body.activityLevel,
    country: body.country,
    isPregnant: body.isPregnant,
    isBreastfeeding: body.isBreastfeeding,
  });

  // Save to DB
  await query(
    `INSERT INTO water_goal (user_id, goal_amount_ml, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())`,
    [user.id, goalLiters]
  );

  return json(res, 200, goalLiters);
};
