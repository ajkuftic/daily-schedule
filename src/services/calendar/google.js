'use strict';

const { google } = require('googleapis');

/**
 * Fetch events from Google Calendar for a given day.
 *
 * @param {object} credentials  - { access_token, refresh_token, expiry_date }
 * @param {string[]} calendarIds - calendar IDs to fetch
 * @param {string[]} reminderCalendarIds - IDs whose events keep their original tz
 * @param {object} calendarNames - { calId: 'Display Name' }
 * @param {Date} dayStart
 * @param {Date} dayEnd
 * @param {string} isoDate      - 'YYYY-MM-DD' target date
 * @param {string} defaultTz
 * @returns {Promise<object[]>} normalized events
 */
async function fetchGoogleCalendarEvents({
  credentials,
  calendarIds,
  reminderCalendarIds = [],
  calendarNames = {},
  dayStart,
  dayEnd,
  isoDate,
  defaultTz,
}) {
  const db = require('../../db/index');
  const dbConfig = db.getAllConfig();
  const clientId     = process.env.GOOGLE_CLIENT_ID     || dbConfig.google_client_id;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || dbConfig.google_client_secret;
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI  || 'http://localhost:3000/auth/google/callback';

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials(credentials);

  // Auto-refresh if expired
  let didRefresh = false;
  if (credentials.expiry_date && Date.now() > credentials.expiry_date - 60000) {
    const { credentials: refreshed } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(refreshed);
    credentials  = refreshed;
    didRefresh   = true;
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const allEvents = [];
  const seen = new Set();

  for (const calId of calendarIds) {
    try {
      const res = await calendar.events.list({
        calendarId:   calId,
        timeMin:      dayStart.toISOString(),
        timeMax:      dayEnd.toISOString(),
        singleEvents: true,
        orderBy:      'startTime',
      });

      for (const item of (res.data.items || [])) {
        if (item.status === 'cancelled') continue;

        const isAllDay    = !!item.start.date;
        const isReminder  = reminderCalendarIds.includes(calId);
        const start       = isAllDay ? new Date(item.start.date + 'T00:00:00') : new Date(item.start.dateTime);
        const end         = isAllDay ? new Date(item.end.date   + 'T00:00:00') : new Date(item.end.dateTime);
        const eventTz     = isAllDay ? null
          : isReminder     ? defaultTz
          : (item.start.timeZone || item.end.timeZone || defaultTz);

        const key = `${item.summary || ''}|${start.getTime()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        allEvents.push({
          title:    item.summary  || '(No title)',
          start:    start.toISOString(),
          end:      end.toISOString(),
          timezone: eventTz || defaultTz,
          rawDate:  isAllDay ? item.start.date : null,
          location: item.location    || '',
          notes:    item.description || '',
          allDay:   isAllDay,
          calendar: calendarNames[calId] || calId,
        });
      }
    } catch (err) {
      console.error(`[google-cal] Error fetching ${calId}:`, err.message);
    }
  }

  return { events: allEvents, refreshedCredentials: didRefresh ? credentials : null };
}

module.exports = { fetchGoogleCalendarEvents };
