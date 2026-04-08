const { verifyFirebaseToken, verifyApiKey, getUserByFirebaseUid, json } = require('../../lib/middleware');
const { query } = require('../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const apiErr = verifyApiKey(req);
  if (apiErr) return json(res, apiErr.status, { error: apiErr.error });

  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  // Parse period or days
  const url = new URL(req.url, `http://${req.headers.host}`);
  const period = url.searchParams.get('period');
  const daysParam = url.searchParams.get('days');

  let days;
  if (period === 'month') days = 30;
  else if (daysParam) days = parseInt(daysParam) || 7;
  else days = 7;

  const tz = user.timezone || 'UTC';

  // Get intake records grouped by day in user's timezone
  const result = await query(
    `WITH date_series AS (
       SELECT generate_series(
         (NOW() AT TIME ZONE $3)::date - ($2 - 1),
         (NOW() AT TIME ZONE $3)::date,
         '1 day'::interval
       )::date AS day
     ),
     daily AS (
       SELECT
         (intake_timestamp AT TIME ZONE $3)::date AS day,
         COALESCE(SUM(intake_amount_ml), 0) / 1000.0 AS intake_liters
       FROM water_intake
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND intake_timestamp >= ((NOW() AT TIME ZONE $3)::date - $2)::timestamp AT TIME ZONE $3
         AND intake_timestamp < ((NOW() AT TIME ZONE $3)::date + 1)::timestamp AT TIME ZONE $3
       GROUP BY (intake_timestamp AT TIME ZONE $3)::date
     )
     SELECT
       ds.day::text AS date,
       ROUND(COALESCE(d.intake_liters, 0)::numeric, 2)::float AS "totalIntake"
     FROM date_series ds
     LEFT JOIN daily d ON ds.day = d.day
     ORDER BY ds.day`,
    [user.id, days, tz]
  );

  const data = result.rows;

  const totalIntake = Math.round(data.reduce((sum, d) => sum + d.totalIntake, 0) * 100) / 100;
  const averageIntake = data.length > 0
    ? Math.round((totalIntake / data.length) * 100) / 100
    : 0;
  const maxIntake = Math.round(Math.max(...data.map(d => d.totalIntake), 0) * 100) / 100;

  // Get active goal
  const goalResult = await query(
    `SELECT goal_amount_ml FROM water_goal
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  const dailyGoal = goalResult.rows.length > 0
    ? Math.round((goalResult.rows[0].goal_amount_ml / 1000.0) * 100) / 100
    : 2.0;

  return json(res, 200, { data, averageIntake, totalIntake, maxIntake, dailyGoal });
};
