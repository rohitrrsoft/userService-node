// Single serverless function that routes all requests
const { json } = require('../lib/middleware');

// Import all handlers
const authRegister = require('../handlers/auth/register');
const authLogin = require('../handlers/auth/login');
const userProfile = require('../handlers/user/profile');
const userUpdateProfile = require('../handlers/user/update-profile');
const userDeactivate = require('../handlers/user/deactivate');
const userReactivate = require('../handlers/user/reactivate');
const userDeleteAccount = require('../handlers/user/delete-account');
const userStreak = require('../handlers/user/streak');
const waterIntakeStore = require('../handlers/water/intake/store');
const waterIntakeDaily = require('../handlers/water/intake/calculate-daily-consumed');
const waterGoalStore = require('../handlers/water/goal/store');
const waterGoalCalculate = require('../handlers/water/goal/calculate');
const waterGoalActive = require('../handlers/water/goal/active');
const waterAnalytics = require('../handlers/water/analytics');
const notificationsRegister = require('../handlers/notifications/register');
const notificationsUnregister = require('../handlers/notifications/unregister');
const notificationsPreferences = require('../handlers/notifications/preferences');
const notificationsTest = require('../handlers/notifications/test');
const notificationsCron = require('../handlers/notifications/cron');
const motivationTypes = require('../handlers/v2/motivation/types');
const motivationType = require('../handlers/v2/motivation/[motivationType]');

function getPath(url) {
  return url.split('?')[0].replace(/\/+$/, '');
}

module.exports = async (req, res) => {
  const path = getPath(req.url);

  try {
    // Auth routes
    if (path === '/api/auth/register' || path === '/auth/register') return await authRegister(req, res);
    if (path === '/api/auth/login' || path === '/auth/login') return await authLogin(req, res);

    // User routes
    if (path === '/api/user/profile') return await userProfile(req, res);
    if (path === '/api/user/update-profile') return await userUpdateProfile(req, res);
    if (path === '/api/user/deactivate') return await userDeactivate(req, res);
    if (path === '/api/user/reactivate') return await userReactivate(req, res);
    if (path === '/api/user/delete-account') return await userDeleteAccount(req, res);

    // Streak routes
    if (path === '/api/user/streak' || path === '/api/user/streak/update') return await userStreak(req, res);

    // Water intake routes
    if (path === '/api/water/intake/store') return await waterIntakeStore(req, res);
    if (path === '/api/water/intake/calculate-daily-consumed') return await waterIntakeDaily(req, res);

    // Water goal routes
    if (path === '/api/water/goal/store') return await waterGoalStore(req, res);
    if (path === '/api/water/goal/calculate') return await waterGoalCalculate(req, res);
    if (path === '/api/water/goal/active') return await waterGoalActive(req, res);

    // Water analytics
    if (path === '/api/water/analytics' || path === '/api/analytics/water-intake') return await waterAnalytics(req, res);

    // Notification routes
    if (path === '/api/notifications/register') return await notificationsRegister(req, res);
    if (path === '/api/notifications/unregister') return await notificationsUnregister(req, res);
    if (path === '/api/notifications/preferences') return await notificationsPreferences(req, res);
    if (path === '/api/notifications/test') return await notificationsTest(req, res);
    if (path === '/api/notifications/cron') return await notificationsCron(req, res);

    // Motivation routes
    if (path === '/api/v2/motivation/types' || path === '/api/motivation/types') return await motivationTypes(req, res);
    if (path.startsWith('/api/v2/motivation/') || path.startsWith('/api/motivation/')) return await motivationType(req, res);

    // Health check
    if (path === '/health' || path === '/api/health') return json(res, 200, { status: 'ok' });

    return json(res, 404, { error: 'Not found: ' + path });
  } catch (e) {
    console.error('Unhandled error:', e);
    return json(res, 500, { error: e.message || 'Internal server error' });
  }
};
