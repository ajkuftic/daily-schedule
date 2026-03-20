'use strict';

const { DAVClient } = require('tsdav');

/**
 * Fetch events from a CalDAV server (Apple iCloud, Fastmail, Nextcloud, etc.)
 *
 * credentials: {
 *   serverUrl:     'https://caldav.fastmail.com',
 *   username:      'user@fastmail.com',
 *   password:      'app-specific-password',
 *   authMethod:    'Basic' | 'Digest' | 'OAuth'
 * }
 * metadata: {
 *   calendarUrls:   ['/dav/calendars/user@fastmail.com/calendar/'],  // optional filter
 *   isReminder:     false,
 *   displayName:    'Fastmail'
 * }
 */
async function fetchCalDAVEvents({
  credentials,
  metadata = {},
  dayStart,
  dayEnd,
  isoDate,
  defaultTz,
}) {
  const client = new DAVClient({
    serverUrl:  credentials.serverUrl,
    credentials: {
      username: credentials.username,
      password: credentials.password,
    },
    authMethod:    credentials.authMethod || 'Basic',
    defaultAccountType: 'caldav',
  });

  await client.login();

  const calendars = await client.fetchCalendars();
  const allEvents = [];

  const targetCalendars = metadata.calendarUrls?.length
    ? calendars.filter(c => metadata.calendarUrls.includes(c.url))
    : calendars;

  for (const cal of targetCalendars) {
    try {
      const objects = await client.fetchCalendarObjects({
        calendar:    cal,
        timeRange:   { start: dayStart.toISOString(), end: dayEnd.toISOString() },
      });

      for (const obj of objects) {
        const parsed = parseVEvent(obj.data, defaultTz);
        if (!parsed) continue;

        allEvents.push({
          ...parsed,
          calendar: metadata.displayName || cal.displayName || 'CalDAV',
        });
      }
    } catch (err) {
      console.error(`[caldav] Error fetching calendar ${cal.url}:`, err.message);
    }
  }

  return allEvents;
}

function parseVEvent(icalData, defaultTz) {
  // Minimal iCal VEVENT parser — extract SUMMARY, DTSTART, DTEND, LOCATION, DESCRIPTION
  const lines = icalData.replace(/\r\n /g, '').replace(/\r\n/g, '\n').split('\n');
  const props = {};
  let inEvent = false;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; continue; }
    if (line === 'END:VEVENT')   { break; }
    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx);
    const val = line.substring(colonIdx + 1);
    props[key.toUpperCase()] = val;
  }

  if (!props['DTSTART']) return null;

  const isAllDay = /^[0-9]{8}$/.test(props['DTSTART']);
  const rawTz    = extractTzParam(props['DTSTART_RAW'] || '', props['DTSTART']) || defaultTz;

  const start = isAllDay
    ? new Date(`${props['DTSTART'].substring(0,4)}-${props['DTSTART'].substring(4,6)}-${props['DTSTART'].substring(6,8)}T00:00:00`)
    : parseICalDate(props['DTSTART']);

  const endRaw = props['DTEND'] || props['DTSTART'];
  const end    = isAllDay
    ? new Date(`${endRaw.substring(0,4)}-${endRaw.substring(4,6)}-${endRaw.substring(6,8)}T00:00:00`)
    : parseICalDate(endRaw);

  return {
    title:    props['SUMMARY']     || '(No title)',
    start:    start.toISOString(),
    end:      end.toISOString(),
    timezone: rawTz,
    rawDate:  isAllDay ? props['DTSTART'] : null,
    location: props['LOCATION']    || '',
    notes:    props['DESCRIPTION'] || '',
    allDay:   isAllDay,
  };
}

function parseICalDate(str) {
  // Basic: 20250615T090000Z or 20250615T090000
  const clean = str.replace(/Z$/, '');
  if (clean.length < 15) return new Date(clean);
  return new Date(`${clean.substring(0,4)}-${clean.substring(4,6)}-${clean.substring(6,8)}T${clean.substring(9,11)}:${clean.substring(11,13)}:${clean.substring(13,15)}${str.endsWith('Z') ? 'Z' : ''}`);
}

function extractTzParam(rawKey, value) {
  const m = rawKey.match(/TZID=([^:;]+)/);
  return m ? m[1] : null;
}

module.exports = { fetchCalDAVEvents };
