const { getAuth } = require('./firebase');
const { query } = require('./db');

/**
 * Verify Firebase JWT token from Authorization header.
 * Sets req.firebaseUid and req.firebaseEmail on success.
 * Returns null on success, or an error response object on failure.
 */
async function verifyFirebaseToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { status: 401, error: 'Missing or invalid Authorization header' };
  }

  const idToken = authHeader.substring(7);
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    req.firebaseUid = decoded.uid;
    req.firebaseEmail = decoded.email;
    return null;
  } catch (e) {
    return { status: 401, error: 'Invalid or expired Firebase token' };
  }
}

/**
 * Verify API key from X-API-KEY header.
 * Returns null on success, or an error response object on failure.
 */
function verifyApiKey(req) {
  const apiKeyValue = process.env.API_KEY_VALUE;
  if (!apiKeyValue) return null; // No API key configured = skip check

  const provided = req.headers['x-api-key'] || req.headers['X-API-KEY'];
  if (!provided || provided !== apiKeyValue) {
    return { status: 403, error: 'Invalid or missing API key' };
  }
  return null;
}

/**
 * Get internal user ID from Firebase UID.
 */
async function getUserByFirebaseUid(firebaseUid) {
  const result = await query(
    'SELECT * FROM users WHERE external_auth_id = $1 AND deleted_at IS NULL',
    [firebaseUid]
  );
  return result.rows[0] || null;
}

/**
 * Parse JSON body from request.
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) {
      resolve(req.body);
      return;
    }
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

/**
 * Send JSON response.
 */
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

module.exports = { verifyFirebaseToken, verifyApiKey, getUserByFirebaseUid, parseBody, json };
