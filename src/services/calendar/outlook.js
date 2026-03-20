'use strict';

const { ConfidentialClientApplication } = require('@azure/msal-node');
const axios = require('axios');

/**
 * Fetch events from Microsoft Graph (Outlook / Exchange Online).
 *
 * credentials: {
 *   access_token:  '...',
 *   refresh_token: '...',
 *   expiry_date:   1234567890000,
 * }
 * metadata: {
 *   calendarIds:  ['AAMkAA...', ...],   // optional filter; if empty, uses default calendar
 *   displayName:  'Outlook',
 * }
 */
async function fetchOutlookCalendarEvents({
  credentials,
  metadata = {},
  dayStart,
  dayEnd,
  isoDate,
  defaultTz,
}) {
  let token = credentials.access_token;

  // Refresh if needed
  if (credentials.expiry_date && Date.now() > credentials.expiry_date - 60000) {
    token = await refreshOutlookToken(credentials.refresh_token);
    credentials = { ...credentials, access_token: token, expiry_date: Date.now() + 3600000 };
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const allEvents = [];

  const calendarIds = metadata.calendarIds?.length ? metadata.calendarIds : [null]; // null = default

  for (const calId of calendarIds) {
    try {
      const base = calId
        ? `https://graph.microsoft.com/v1.0/me/calendars/${calId}/events`
        : `https://graph.microsoft.com/v1.0/me/calendarview`;

      const params = new URLSearchParams({
        startDateTime: dayStart.toISOString(),
        endDateTime:   dayEnd.toISOString(),
        $orderby:      'start/dateTime',
        $top:          '50',
        $select:       'subject,start,end,location,body,isAllDay',
      });

      const { data } = await axios.get(`${base}?${params}`, { headers });

      for (const item of (data.value || [])) {
        const isAllDay = item.isAllDay;
        const start    = new Date(item.start.dateTime + (item.start.timeZone === 'UTC' ? 'Z' : ''));
        const end      = new Date(item.end.dateTime   + (item.end.timeZone   === 'UTC' ? 'Z' : ''));
        const eventTz  = isAllDay ? defaultTz : (item.start.timeZone || defaultTz);

        allEvents.push({
          title:    item.subject || '(No title)',
          start:    start.toISOString(),
          end:      end.toISOString(),
          timezone: eventTz,
          rawDate:  isAllDay ? isoDate : null,
          location: item.location?.displayName || '',
          notes:    item.body?.content || '',
          allDay:   isAllDay,
          calendar: metadata.displayName || 'Outlook',
        });
      }
    } catch (err) {
      console.error('[outlook] Error fetching calendar:', err.message);
    }
  }

  return { events: allEvents, refreshedCredentials: credentials };
}

async function refreshOutlookToken(refreshToken) {
  const msalClient = new ConfidentialClientApplication({
    auth: {
      clientId:     process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      authority:    'https://login.microsoftonline.com/common',
    },
  });

  const result = await msalClient.acquireTokenByRefreshToken({
    refreshToken,
    scopes: ['Calendars.Read', 'Mail.Send'],
  });

  return result.accessToken;
}

module.exports = { fetchOutlookCalendarEvents };
