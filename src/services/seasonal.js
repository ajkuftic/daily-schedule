'use strict';

// Returns { primary_color, accent_color, label } overrides or null
function getSeasonalTheme(isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  const month = d.getUTCMonth() + 1; // 1-12
  const day   = d.getUTCDate();

  // Holidays (exact date ranges take priority)
  if (month === 12 && day >= 1)         return { primary_color: '#1a472a', accent_color: '#c41e3a', label: '🎄 Christmas Season' };
  if (month === 1  && day <= 5)         return { primary_color: '#1a472a', accent_color: '#c41e3a', label: '🎄 Christmas Season' };
  if (month === 10 && day >= 25)        return { primary_color: '#2d1b4e', accent_color: '#ff6b00', label: '🎃 Halloween' };
  if (month === 2  && day === 14)       return { primary_color: '#8b0000', accent_color: '#ff69b4', label: '💝 Valentine\'s Day' };
  if (month === 11 && day >= 20 && day <= 30) return { primary_color: '#5c3317', accent_color: '#d2691e', label: '🦃 Thanksgiving' };

  // Seasons
  if (month >= 3  && month <= 5)        return { primary_color: '#2e5e2e', accent_color: '#7ec8a0', label: '🌸 Spring' };
  if (month >= 6  && month <= 8)        return { primary_color: '#005f8e', accent_color: '#ffd700', label: '☀️ Summer' };
  if (month >= 9  && month <= 11)       return { primary_color: '#6b3a2a', accent_color: '#e8892b', label: '🍂 Autumn' };
  // Winter (Dec handled above)
  return { primary_color: '#1e3a5f', accent_color: '#a8c4e0', label: '❄️ Winter' };
}

module.exports = { getSeasonalTheme };
