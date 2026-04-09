const { verifyFirebaseToken, getUserByFirebaseUid, parseBody, json } = require('../../lib/middleware');
const { getAuth } = require('../../lib/firebase');
const { query } = require('../../lib/db');

const FIREBASE_SIGNIN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

module.exports = async (req, res) => {
  if (req.method !== 'DELETE') return json(res, 405, { error: 'Method not allowed' });


  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  const body = await parseBody(req);
  const { password } = body;

  try {
    // Step 1: Re-authenticate with Firebase
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    const firebaseRes = await fetch(`${FIREBASE_SIGNIN_URL}?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password, returnSecureToken: true }),
    });

    if (!firebaseRes.ok) {
      return json(res, 400, { error: 'Password verification failed. Cannot delete account.' });
    }

    // Step 2: Soft delete in DB
    await query(
      `UPDATE users SET active = false, deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [user.id]
    );

    // Step 3: Hard delete from Firebase
    await getAuth().deleteUser(req.firebaseUid);

    return json(res, 200, { message: 'Account deleted permanently' });
  } catch (e) {
    return json(res, 500, { error: e.message || 'Account deletion failed' });
  }
};
