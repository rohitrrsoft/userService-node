const { verifyFirebaseToken, verifyApiKey, getUserByFirebaseUid, parseBody, json } = require('../../lib/middleware');
const { query, transaction } = require('../../lib/db');

module.exports = async (req, res) => {
  const apiErr = verifyApiKey(req);
  if (apiErr) return json(res, apiErr.status, { error: apiErr.error });

  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  // GET /api/user/streak
  if (req.method === 'GET') {
    const result = await query(
      `SELECT current_streak, longest_streak, last_check_in_date, total_check_ins
       FROM user_streaks WHERE external_auth_id = $1 AND deleted_at IS NULL`,
      [req.firebaseUid]
    );

    if (result.rows.length === 0) {
      return json(res, 200, {
        currentStreak: 0,
        longestStreak: 0,
        lastCheckInDate: null,
        totalCheckIns: 0,
      });
    }

    const s = result.rows[0];
    return json(res, 200, {
      currentStreak: s.current_streak,
      longestStreak: s.longest_streak,
      lastCheckInDate: s.last_check_in_date,
      totalCheckIns: s.total_check_ins,
    });
  }

  // POST /api/user/streak/update — handled via URL path check
  if (req.method === 'POST') {
    return handleStreakUpdate(req, res);
  }

  return json(res, 405, { error: 'Method not allowed' });
};

async function handleStreakUpdate(req, res) {
  const body = await parseBody(req);
  const checkInDate = body.checkInDate; // "YYYY-MM-DD"

  if (!checkInDate) return json(res, 400, { error: 'checkInDate is required' });

  // Validate not in future
  const today = new Date().toISOString().split('T')[0];
  if (checkInDate > today) {
    return json(res, 400, { error: 'Check-in date cannot be in the future' });
  }

  const result = await transaction(async (client) => {
    // Find or create streak
    let streakResult = await client.query(
      `SELECT * FROM user_streaks WHERE external_auth_id = $1 AND deleted_at IS NULL`,
      [req.firebaseUid]
    );

    let streak = streakResult.rows[0];

    if (!streak) {
      // Get user to get userId
      const userResult = await client.query(
        'SELECT id FROM users WHERE external_auth_id = $1 AND deleted_at IS NULL',
        [req.firebaseUid]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');

      const insertResult = await client.query(
        `INSERT INTO user_streaks (user_id, external_auth_id, current_streak, longest_streak, total_check_ins, created_at, updated_at)
         VALUES ($1, $2, 0, 0, 0, NOW(), NOW()) RETURNING *`,
        [userResult.rows[0].id, req.firebaseUid]
      );
      streak = insertResult.rows[0];
    }

    // Already checked in today?
    if (streak.last_check_in_date && streak.last_check_in_date.toISOString().split('T')[0] === checkInDate) {
      return {
        currentStreak: streak.current_streak,
        longestStreak: streak.longest_streak,
        message: 'Already checked in today!',
        isNewRecord: false,
        milestoneReached: false,
        milestone: null,
      };
    }

    // Calculate new streak
    let newStreak;
    if (!streak.last_check_in_date) {
      newStreak = 1;
    } else {
      const lastDate = new Date(streak.last_check_in_date);
      const currentDate = new Date(checkInDate);
      const daysBetween = Math.round((currentDate - lastDate) / (1000 * 60 * 60 * 24));

      if (daysBetween === 1) {
        newStreak = streak.current_streak + 1;
      } else if (daysBetween > 1) {
        newStreak = 1;
      } else {
        newStreak = streak.current_streak;
      }
    }

    const previousStreak = streak.current_streak;
    const isNewRecord = newStreak > streak.longest_streak;
    const newLongest = isNewRecord ? newStreak : streak.longest_streak;
    const milestoneReached = newStreak % 7 === 0 && newStreak > 0;

    await client.query(
      `UPDATE user_streaks
       SET current_streak = $1, longest_streak = $2, last_check_in_date = $3,
           total_check_ins = total_check_ins + 1, updated_at = NOW()
       WHERE id = $4`,
      [newStreak, newLongest, checkInDate, streak.id]
    );

    // Build message
    let message;
    if (newStreak === 1 && previousStreak > 1) {
      message = "Don't give up! Starting fresh - let's build that streak again! 💪";
    } else if (newStreak === 1) {
      message = 'Great start! Keep it going! 🎉';
    } else if (milestoneReached) {
      message = `🔥 Amazing! ${newStreak} day milestone reached! You're crushing it! 🎉`;
    } else if (isNewRecord) {
      message = `🏆 New personal record: ${newStreak} days! Keep the momentum! 🔥`;
    } else {
      message = `Awesome! ${newStreak} day streak! Keep it up! 🔥`;
    }

    return {
      currentStreak: newStreak,
      longestStreak: newLongest,
      message,
      isNewRecord,
      milestoneReached,
      milestone: milestoneReached ? newStreak : null,
    };
  });

  return json(res, 200, result);
}
