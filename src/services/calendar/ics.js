'use strict';

const axios = require('axios');

/**
 * Fetch events from a public ICS feed URL.
 *
 * credentials: { url: 'https://...' }
 * metadata:    { displayName: 'Holidays' }
 */
async function fetchICSEvents({ credentials, metadata = {}, isoDate, defaultTz }) {
  const name = metadata.displayName || 'ICS';
  try {
    const { data } = await axios.get(credentials.url, { timeout: 10000, responseType: 'text' });
    const totalVevents = (data.match(/BEGIN:VEVENT/g) || []).length;
    const events = parseICS(data, isoDate, defaultTz, name);
    console.log(`[ics] "${name}": ${totalVevents} total VEVENTs in feed, ${events.length} match ${isoDate}`);
    if (events.length > 0) {
      for (const e of events) console.log(`[ics]   → "${e.title}" allDay=${e.allDay} start=${e.start}`);
    }
    return events;
  } catch (err) {
    console.error(`[ics] "${name}": Failed to fetch feed:`, err.message);
    return [];
  }
}

function parseICS(icsText, isoDate, defaultTz, calendarName) {
  const events = [];
  const normalized = icsText.replace(/\r\n /g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const vevents = normalized.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

  for (const block of vevents) {
    const get = (key) => {
      const m = block.match(new RegExp(`^${key}[;:][^\n]*`, 'm'));
      if (!m) return null;
      const colonIdx = m[0].indexOf(':');
      return colonIdx !== -1 ? m[0].substring(colonIdx + 1).trim() : null;
    };

    const dtstart = get('DTSTART') || get('DTSTART;.*?');
    if (!dtstart) continue;

    const isAllDay = /^\d{8}$/.test(dtstart);
    let rawDate = null;
    let start, end;

    if (isAllDay) {
      rawDate = `${dtstart.substring(0,4)}-${dtstart.substring(4,6)}-${dtstart.substring(6,8)}`;
      const dtend = get('DTEND') || dtstart;
      const endDate = `${dtend.substring(0,4)}-${dtend.substring(4,6)}-${dtend.substring(6,8)}`;
      // Include if isoDate falls within the event's range (DTEND is exclusive in iCal)
      if (isoDate < rawDate || isoDate >= endDate) continue;
      start = new Date(`${rawDate}T00:00:00`);
      end = new Date(`${endDate}T00:00:00`);
    } else {
      start = parseICalDate(dtstart);
      const dtend = get('DTEND') || dtstart;
      end   = parseICalDate(dtend);
      // Date check is done by the newsletter orchestrator, include all for now
    }

    events.push({
      title:    get('SUMMARY')     || '(No title)',
      start:    start.toISOString(),
      end:      end.toISOString(),
      timezone: defaultTz,
      rawDate,
      location: get('LOCATION')    || '',
      notes:    (get('DESCRIPTION') || '').replace(/\\n/g, '\n').replace(/\\,/g, ','),
      allDay:   isAllDay,
      calendar: calendarName,
    });
  }

  return events;
}

function parseICalDate(str) {
  const clean = str.replace(/Z$/, '');
  if (clean.length < 15) return new Date(clean);
  return new Date(
    `${clean.substring(0,4)}-${clean.substring(4,6)}-${clean.substring(6,8)}` +
    `T${clean.substring(9,11)}:${clean.substring(11,13)}:${clean.substring(13,15)}` +
    (str.endsWith('Z') ? 'Z' : '')
  );
}

module.exports = { fetchICSEvents };
