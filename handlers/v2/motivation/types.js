const { json } = require('../../../lib/middleware');

const MOTIVATION_TYPES = [
  'FITNESS_MOTIVATION',
  'MINDFUL_HYDRATION',
  'FUN_PLAYFUL',
  'GOAL_DRIVEN',
  'HYDRATION_FACTS',
  'POSITIVE_VIBES',
  'DAILY_KICKSTART',
  'EVENING_CALM',
];

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  return json(res, 200, MOTIVATION_TYPES);
};
