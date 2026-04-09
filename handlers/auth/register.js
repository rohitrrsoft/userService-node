const { verifyApiKey, parseBody, json } = require('../../lib/middleware');
const { getAuth } = require('../../lib/firebase');
const { transaction } = require('../../lib/db');
const { calculateHydrationGoal } = require('../../lib/water-intake-util');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const apiErr = verifyApiKey(req);
  if (apiErr) return json(res, apiErr.status, { error: apiErr.error });

  const body = await parseBody(req);
  const { email, password, firstName, lastName, dob, weightLbs, heightCm, gender,
          activityLevel, country, timezone, isPregnant, isBreastfeeding, deviceType } = body;

  // Validate input
  if (!email || !email.trim()) return json(res, 400, { error: 'Email cannot be blank' });
  if (!firstName || !firstName.trim()) return json(res, 400, { error: 'First name cannot be blank' });
  if (!lastName || !lastName.trim()) return json(res, 400, { error: 'Last name cannot be blank' });
  if (!/^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$/.test(email)) {
    return json(res, 400, { error: 'Invalid email format' });
  }

  try {
    // Check if user exists in Firebase
    let firebaseUser;
    try {
      firebaseUser = await getAuth().getUserByEmail(email);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        // Create Firebase user
        firebaseUser = await getAuth().createUser({
          email,
          displayName: `${firstName} ${lastName}`,
          password,
        });
      } else {
        throw e;
      }
    }

    const result = await transaction(async (client) => {
      // Check DB for existing user
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        throw new Error('User with email ' + email + ' already exists');
      }

      // Parse height
      const heightValue = String(heightCm).replace(/[^0-9.]/g, '');

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (
           email, first_name, last_name, external_auth_id, dob,
           weight, weight_unit, height, height_unit,
           gender, exercise_frequency, country, timezone,
           is_pregnant, is_breastfeeding, device_type,
           active, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'lbs',$7,'cm',$8,$9,$10,$11,$12,$13,$14,true,NOW(),NOW())
         RETURNING *`,
        [email, firstName, lastName, firebaseUser.uid, dob,
         weightLbs, heightValue, gender, activityLevel, country,
         timezone, isPregnant || false, isBreastfeeding || false, deviceType || 'unknown']
      );
      const savedUser = userResult.rows[0];

      // Calculate hydration goal
      const hydrationGoal = calculateHydrationGoal({
        weightLbs, activityLevel, country, isPregnant, isBreastfeeding,
      });

      // Store goal
      await client.query(
        `INSERT INTO water_goal (user_id, goal_amount_ml, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())`,
        [savedUser.id, hydrationGoal * 1000]
      );

      // Generate custom token
      const sessionToken = await getAuth().createCustomToken(firebaseUser.uid);

      return { sessionToken, hydrationGoal, user: savedUser };
    });

    return json(res, 201, result);
  } catch (e) {
    const msg = e.message || 'Registration failed';
    const status = msg.includes('already exists') ? 409 : 500;
    return json(res, status, { error: msg });
  }
};
