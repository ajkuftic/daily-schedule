'use strict';

const CITY_COORDS = {
  'paris':         { city: 'Paris, France',            lat: 48.8566,  lon: 2.3522   },
  'london':        { city: 'London, UK',               lat: 51.5074,  lon: -0.1278  },
  'new york':      { city: 'New York, NY',             lat: 40.7128,  lon: -74.006  },
  'budapest':      { city: 'Budapest, Hungary',        lat: 47.4979,  lon: 19.0402  },
  'vienna':        { city: 'Vienna, Austria',          lat: 48.2082,  lon: 16.3738  },
  'amsterdam':     { city: 'Amsterdam, Netherlands',   lat: 52.3676,  lon: 4.9041   },
  'rome':          { city: 'Rome, Italy',              lat: 41.9028,  lon: 12.4964  },
  'barcelona':     { city: 'Barcelona, Spain',         lat: 41.3851,  lon: 2.1734   },
  'prague':        { city: 'Prague, Czech Republic',   lat: 50.0755,  lon: 14.4378  },
  'bratislava':    { city: 'Bratislava, Slovakia',     lat: 48.1486,  lon: 17.1077  },
  'pittsburgh':    { city: 'Pittsburgh, PA',           lat: 40.4406,  lon: -79.9959 },
  'nashville':     { city: 'Nashville, TN',            lat: 36.1627,  lon: -86.7816 },
  'chicago':       { city: 'Chicago, IL',              lat: 41.8781,  lon: -87.6298 },
  'miami':         { city: 'Miami, FL',                lat: 25.7617,  lon: -80.1918 },
  'denver':        { city: 'Denver, CO',               lat: 39.7392,  lon: -104.9903 },
  'seattle':       { city: 'Seattle, WA',              lat: 47.6062,  lon: -122.3321 },
  'los angeles':   { city: 'Los Angeles, CA',          lat: 34.0522,  lon: -118.2437 },
  'san francisco': { city: 'San Francisco, CA',        lat: 37.7749,  lon: -122.4194 },
  'washington':    { city: 'Washington, DC',           lat: 38.9072,  lon: -77.0369  },
  'boston':        { city: 'Boston, MA',               lat: 42.3601,  lon: -71.0589  },
};


function resolveWeatherLocation(events, defaultCity, defaultLat, defaultLon) {
  const defaultLocation = { city: defaultCity, lat: defaultLat, lon: defaultLon };

  // Pass 1: all-day event titles/locations
  for (const e of events) {
    if (!e.allDay) continue;
    const text = `${e.title} ${e.location}`.toLowerCase();
    for (const key of Object.keys(CITY_COORDS)) {
      if (text.includes(key)) return CITY_COORDS[key];
    }
  }

  // Pass 2: timed event titles/locations
  for (const e of events) {
    if (e.allDay) continue;
    const text = `${e.title} ${e.location}`.toLowerCase();
    for (const key of Object.keys(CITY_COORDS)) {
      if (text.includes(key)) return CITY_COORDS[key];
    }
  }

  return defaultLocation;
}

function buildClothingTip(weather, events) {
  const { high, rainChance, code } = weather;
  let tip = '';

  if (high >= 75)      tip += "It's going to be a warm one — light, breathable layers are all you need. ";
  else if (high >= 60) tip += 'Pleasant temperatures today — a light jacket in the morning and you\'ll be set. ';
  else if (high >= 45) tip += 'A bit cool out, so plan on a medium jacket or a warm layer. ';
  else                 tip += 'Bundle up — it\'s cold out there. A heavy coat, scarf, and gloves are worth it. ';

  if (rainChance >= 70)      tip += 'Rain is very likely today, so don\'t leave home without a rain jacket or umbrella. ';
  else if (rainChance >= 40) tip += `There's a ${rainChance}% chance of rain — an umbrella in your bag is a good call. `;
  else if (rainChance >= 20) tip += `A small chance of a shower (${rainChance}%) — a compact umbrella wouldn't hurt. `;

  const hasEveningOutdoor = events.some(e => {
    if (e.allDay) return false;
    const hour = new Date(e.start).getHours();
    const text = `${e.title} ${e.location}`.toLowerCase();
    return /walk|hike|park|outdoor|tour|stroll|garden|market|bike/.test(text) && hour >= 14;
  });

  if (hasEveningOutdoor && high < 65)  tip += 'Temperatures will drop in the evening, so bring an extra layer if you\'re heading out later. ';
  if (code === 0 && high >= 65)        tip += "It'll be bright and sunny — sunscreen and sunglasses are a good idea. ";

  return tip.trim();
}

module.exports = { resolveWeatherLocation, buildClothingTip };
