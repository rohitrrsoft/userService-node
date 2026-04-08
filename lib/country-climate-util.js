const COUNTRY_CLIMATE_MAP = {
  'United States': 'moderate',
  'India': 'hot',
  'Canada': 'cold',
  'Australia': 'hot',
  'United Kingdom': 'moderate',
  'Germany': 'moderate',
  'Russia': 'cold',
  'Brazil': 'hot',
  'China': 'moderate',
  'Japan': 'moderate',
  'South Africa': 'hot',
  'France': 'moderate',
  'Italy': 'moderate',
  'Mexico': 'hot',
  'Argentina': 'moderate',
  'Saudi Arabia': 'hot',
  'Norway': 'cold',
  'Sweden': 'cold',
  'Finland': 'cold',
};

function getClimateByCountry(country) {
  return COUNTRY_CLIMATE_MAP[country] || 'moderate';
}

module.exports = { getClimateByCountry };
