'use strict';

function formatTime(date, tz) {
  return new Intl.DateTimeFormat('en-US', {
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true,
    timeZone: tz || 'America/New_York',
  }).format(new Date(date));
}

module.exports = { formatTime };
