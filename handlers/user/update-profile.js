const { verifyFirebaseToken, verifyApiKey, getUserByFirebaseUid, parseBody, json } = require('../../lib/middleware');
const { getAuth } = require('../../lib/firebase');
const { query } = require('../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const apiErr = verifyApiKey(req);
  if (apiErr) return json(res, apiErr.status, { error: apiErr.error });

  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  const body = await parseBody(req);

  try {
    // Handle email change — update Firebase first
    if (body.email && body.email !== user.email) {
      try {
        await getAuth().updateUser(req.firebaseUid, {
          email: body.email,
          emailVerified: false,
        });
      } catch (e) {
        if (e.code === 'auth/email-already-exists') {
          return json(res, 400, { error: 'This email is already in use by another account' });
        }
        if (e.code === 'auth/invalid-email') {
          return json(res, 400, { error: 'Invalid email format' });
        }
        return json(res, 400, { error: 'Failed to update email: ' + e.message });
      }
    }

    // Update Firebase displayName if name changed
    if (body.firstName || body.lastName) {
      const newFirst = body.firstName || user.first_name;
      const newLast = body.lastName || user.last_name;
      try {
        await getAuth().updateUser(req.firebaseUid, {
          displayName: `${newFirst} ${newLast}`,
        });
      } catch (e) {
        // Non-critical, don't fail
      }
    }

    // Build dynamic UPDATE query
    const updates = [];
    const values = [];
    let idx = 1;

    const fieldMap = {
      email: 'email', firstName: 'first_name', lastName: 'last_name',
      gender: 'gender', weight: 'weight', weightUnit: 'weight_unit',
      height: 'height', heightUnit: 'height_unit',
      exerciseFrequency: 'exercise_frequency', country: 'country',
      timezone: 'timezone', dob: 'dob', motivationType: 'motivation_type',
    };

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if (body[jsKey] !== undefined && body[jsKey] !== null) {
        updates.push(`${dbCol} = $${idx}`);
        values.push(body[jsKey]);
        idx++;
      }
    }

    if (updates.length === 0) {
      return json(res, 200, user);
    }

    updates.push(`updated_at = NOW()`);
    values.push(user.id);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    return json(res, 200, result.rows[0]);
  } catch (e) {
    return json(res, 500, { error: e.message || 'Profile update failed' });
  }
};
