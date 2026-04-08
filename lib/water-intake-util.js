const { getClimateByCountry } = require('./country-climate-util');

/**
 * Calculate hydration goal in liters.
 * Formula: (weight_kg * 0.035) + activity_adjustment + climate_adjustment + pregnancy_adjustment
 */
function calculateHydrationGoal({ weightLbs, activityLevel, country, isPregnant, isBreastfeeding }) {
  const weightKg = weightLbs * 0.453592;
  let baseIntake = weightKg * 0.035;

  // Activity level adjustments
  const level = (activityLevel || '').toLowerCase();
  if (level === 'moderate') baseIntake += 0.5;
  else if (level === 'active' || level === 'high') baseIntake += 1.0;

  // Climate adjustment
  const climate = getClimateByCountry(country);
  if (climate === 'hot') baseIntake += 0.5;

  // Pregnancy and breastfeeding
  if (isPregnant) baseIntake += 0.3;
  if (isBreastfeeding) baseIntake += 0.7;

  return Math.round(baseIntake * 100.0) / 100.0;
}

module.exports = { calculateHydrationGoal };
