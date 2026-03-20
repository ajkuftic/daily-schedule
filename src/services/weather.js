'use strict';

const axios = require('axios');

async function fetchWeather(lat, lon, isoDate) {
  const url = 'https://api.open-meteo.com/v1/forecast';
  const params = {
    latitude:  lat,
    longitude: lon,
    daily:     'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode',
    temperature_unit: 'fahrenheit',
    timezone:  'auto',
    start_date: isoDate,
    end_date:   isoDate,
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data } = await axios.get(url, { params, timeout: 10000 });
      if (!data.daily?.weathercode) throw new Error('Missing daily data');

      const code = data.daily.weathercode[0];
      const high = Math.round(data.daily.temperature_2m_max[0]);
      const low  = Math.round(data.daily.temperature_2m_min[0]);
      const rain = data.daily.precipitation_probability_max[0];

      return {
        condition:  wmoToCondition(code),
        high,
        low,
        highC: Math.round((high - 32) * 5 / 9),
        lowC:  Math.round((low  - 32) * 5 / 9),
        rainChance: rain,
        code,
      };
    } catch (err) {
      if (attempt < 3) await sleep(5000 * attempt);
    }
  }

  return { condition: 'Unavailable', high: '–', low: '–', highC: '–', lowC: '–', rainChance: 0, code: -1 };
}

function wmoToCondition(code) {
  if (code === 0)  return 'Clear and Sunny';
  if (code <= 2)   return 'Partly Cloudy';
  if (code === 3)  return 'Overcast';
  if (code <= 49)  return 'Foggy';
  if (code <= 57)  return 'Light Drizzle';
  if (code <= 67)  return 'Rainy';
  if (code <= 77)  return 'Snow';
  if (code <= 82)  return 'Rain Showers';
  if (code <= 99)  return 'Thunderstorms';
  return 'Mixed Conditions';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { fetchWeather };
