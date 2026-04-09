const { verifyFirebaseToken, getUserByFirebaseUid, json } = require('../../lib/middleware');
const { query } = require('../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });


  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  const user = await getUserByFirebaseUid(req.firebaseUid);
  if (!user) return json(res, 404, { error: 'User not found' });

  if (user.deleted_at) {
    return json(res, 400, { error: 'Cannot reactivate a permanently deleted account. Please register a new account.' });
  }

  await query('UPDATE users SET active = true, updated_at = NOW() WHERE id = $1', [user.id]);

  return json(res, 200, { message: 'Account reactivated successfully' });
};
