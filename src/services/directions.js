'use strict';

const axios = require('axios');

/**
 * Get driving duration between two addresses via Google Maps Distance Matrix API.
 * Returns a human-readable duration string (e.g. "About 25 minutes") or null on failure.
 */
async function getTravelDuration(origin, destination, apiKey) {
  if (!origin || !destination || !apiKey) return null;
  if (origin.trim().toLowerCase() === destination.trim().toLowerCase()) return null;

  try {
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins:      origin,
        destinations: destination,
        mode:         'driving',
        key:          apiKey,
      },
      timeout: 8000,
    });

    const el = data.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK') return null;

    const mins = Math.ceil(el.duration.value / 60);
    if (mins < 60) return `About ${mins} minute${mins === 1 ? '' : 's'}`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `About ${h}h ${m}min` : `About ${h} hour${h > 1 ? 's' : ''}`;
  } catch {
    return null;
  }
}

module.exports = { getTravelDuration };
