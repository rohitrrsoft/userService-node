const { verifyFirebaseToken, verifyApiKey, json } = require('../../../lib/middleware');
const { query } = require('../../../lib/db');

const MOTIVATION_TYPES = [
  'FITNESS_MOTIVATION', 'MINDFUL_HYDRATION', 'FUN_PLAYFUL', 'GOAL_DRIVEN',
  'HYDRATION_FACTS', 'POSITIVE_VIBES', 'DAILY_KICKSTART', 'EVENING_CALM',
];

const DISPLAY_NAMES = {
  FITNESS_MOTIVATION: 'Fitness Motivation',
  MINDFUL_HYDRATION: 'Mindful Hydration',
  FUN_PLAYFUL: 'Fun & Playful',
  GOAL_DRIVEN: 'Goal Driven',
  HYDRATION_FACTS: 'Hydration Facts',
  POSITIVE_VIBES: 'Positive Vibes',
  DAILY_KICKSTART: 'Daily Kickstart',
  EVENING_CALM: 'Evening Calm',
};

const FALLBACK_MESSAGES = {
  FITNESS_MOTIVATION: "Stay hydrated, stay strong! Every sip fuels your fitness journey. 💪💧",
  MINDFUL_HYDRATION: "Listen to your body's signals. A mindful sip of water is self-care in action. 🧘‍♀️💙",
  FUN_PLAYFUL: "Water you waiting for? Let's make hydration fun! Sip, sip, hooray! 🎉💦",
  GOAL_DRIVEN: "Every goal starts with a single step—or in this case, a single sip. Stay on track! 🎯💧",
  HYDRATION_FACTS: "Did you know? Your brain is 75% water. Keep it sharp with proper hydration! 🧠💧",
  POSITIVE_VIBES: "You're doing amazing! Keep spreading positivity one refreshing sip at a time. ✨💙",
  DAILY_KICKSTART: "Good morning, champion! Start your day right with a glass of water. Let's go! ☀️💧",
  EVENING_CALM: "Wind down peacefully. A gentle sip of water to close your day with wellness. 🌙💙",
};

// Simple in-memory recently-shown tracker (per type)
const recentlyShown = {};

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const apiErr = verifyApiKey(req);
  if (apiErr) return json(res, apiErr.status, { error: apiErr.error });

  const authErr = await verifyFirebaseToken(req);
  if (authErr) return json(res, authErr.status, { error: authErr.error });

  // Extract motivationType from URL path
  const urlParts = req.url.split('/');
  const rawType = urlParts[urlParts.length - 1].split('?')[0];
  const motivationType = rawType.toUpperCase();

  if (!MOTIVATION_TYPES.includes(motivationType)) {
    return json(res, 400, { error: 'Invalid motivation type: ' + rawType });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const language = url.searchParams.get('language') || 'en';

  try {
    // Get random messages from DB
    let result = await query(
      `SELECT id, message, title FROM motivation_messages
       WHERE type = $1 AND language = $2 AND active = true AND deleted_at IS NULL
       ORDER BY RANDOM() LIMIT 10`,
      [motivationType, language]
    );

    // Fallback to any language
    if (result.rows.length === 0) {
      result = await query(
        `SELECT id, message, title FROM motivation_messages
         WHERE type = $1 AND active = true AND deleted_at IS NULL
         ORDER BY RANDOM() LIMIT 10`,
        [motivationType]
      );
    }

    // Fallback to hardcoded
    if (result.rows.length === 0) {
      return json(res, 200, {
        motivationType,
        message: FALLBACK_MESSAGES[motivationType],
        displayName: DISPLAY_NAMES[motivationType],
        timestamp: Date.now(),
      });
    }

    // Pick non-recent message
    const recent = recentlyShown[motivationType] || [];
    let selected = result.rows.find(m => !recent.includes(m.id)) || result.rows[0];

    // Track recently shown
    if (!recentlyShown[motivationType]) recentlyShown[motivationType] = [];
    recentlyShown[motivationType].push(selected.id);
    if (recentlyShown[motivationType].length > 5) recentlyShown[motivationType].shift();

    return json(res, 200, {
      motivationType,
      message: selected.message,
      displayName: selected.title || DISPLAY_NAMES[motivationType],
      timestamp: Date.now(),
    });
  } catch (e) {
    return json(res, 200, {
      motivationType,
      message: FALLBACK_MESSAGES[motivationType],
      displayName: DISPLAY_NAMES[motivationType],
      timestamp: Date.now(),
    });
  }
};
