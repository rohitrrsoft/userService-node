const { verifyApiKey, parseBody, json } = require('../../lib/middleware');
const { getAuth } = require('../../lib/firebase');
const { query } = require('../../lib/db');

const FIREBASE_SIGNIN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const apiErr = verifyApiKey(req);
  if (apiErr) return json(res, apiErr.status, { error: apiErr.error });

  const body = await parseBody(req);
  const { email, password } = body;

  try {
    // Find user in DB
    const userResult = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    if (userResult.rows.length === 0) {
      return json(res, 404, { error: 'User not found with email: ' + email });
    }

    const user = userResult.rows[0];

    // Check if permanently deleted
    if (user.deleted_at) {
      return json(res, 400, { error: 'Account has been permanently deleted and cannot be recovered' });
    }

    // Verify password with Firebase REST API
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    if (!firebaseApiKey) {
      return json(res, 500, { error: 'Firebase API key not configured' });
    }

    const firebaseRes = await fetch(`${FIREBASE_SIGNIN_URL}?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });

    if (!firebaseRes.ok) {
      const errData = await firebaseRes.json().catch(() => ({}));
      const errMsg = errData?.error?.message || 'Authentication failed';
      if (errMsg.includes('INVALID_PASSWORD') || errMsg.includes('INVALID_LOGIN_CREDENTIALS')) {
        return json(res, 401, { error: 'Invalid password' });
      }
      if (errMsg.includes('EMAIL_NOT_FOUND')) {
        return json(res, 404, { error: 'User not found' });
      }
      if (errMsg.includes('USER_DISABLED')) {
        return json(res, 403, { error: 'User account is disabled' });
      }
      if (errMsg.includes('TOO_MANY_ATTEMPTS')) {
        return json(res, 429, { error: 'Too many failed attempts. Please try again later' });
      }
      return json(res, 401, { error: 'Authentication failed: ' + errMsg });
    }

    const firebaseData = await firebaseRes.json();
    const firebaseUid = firebaseData.localId;

    // Verify UID match
    if (firebaseUid !== user.external_auth_id) {
      return json(res, 401, { error: 'Authentication failed: User mismatch' });
    }

    // Auto-reactivate deactivated account
    if (!user.active) {
      await query('UPDATE users SET active = true, updated_at = NOW() WHERE id = $1', [user.id]);
      user.active = true;
    }

    // Get active hydration goal
    const goalResult = await query(
      `SELECT goal_amount_ml FROM water_goal
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );
    const hydrationGoal = goalResult.rows.length > 0
      ? goalResult.rows[0].goal_amount_ml / 1000.0
      : 0.0;

    // Calculate daily intake
    const tz = user.timezone || 'UTC';
    const intakeResult = await query(
      `SELECT COALESCE(SUM(intake_amount_ml), 0) AS total_ml
       FROM water_intake
       WHERE user_id = $1 AND deleted_at IS NULL
         AND intake_timestamp >= (NOW() AT TIME ZONE $2)::date::timestamp AT TIME ZONE $2
         AND intake_timestamp < ((NOW() AT TIME ZONE $2)::date + INTERVAL '1 day')::timestamp AT TIME ZONE $2`,
      [user.id, tz]
    );
    const currentIntake = parseFloat(intakeResult.rows[0].total_ml);

    // Generate session token
    const sessionToken = await getAuth().createCustomToken(user.external_auth_id);

    return json(res, 200, { sessionToken, hydrationGoal, user, currentIntake });
  } catch (e) {
    return json(res, 500, { error: e.message || 'Login failed' });
  }
};
