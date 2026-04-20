'use strict';

const axios  = require('axios');
const { RRule } = require('rrule');

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

  // Unfold continuation lines (CRLF/LF followed by SPACE or TAB)
  const normalized = icsText
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const vevents = normalized.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

  // Pre-pass: collect cancelled instances from STATUS:CANCELLED + RECURRENCE-ID blocks.
  // Google Calendar (and others) represent individually-deleted occurrences this way
  // rather than adding them to EXDATE on the main VEVENT.
  const cancelledInstances = new Set(); // "uid:YYYY-MM-DD"
  for (const block of vevents) {
    const getP = (key) => { const m = block.match(new RegExp(`^${key}(?:;[^:]*)?:(.+)$`, 'm')); return m ? m[1].trim() : null; };
    if (getP('STATUS') !== 'CANCELLED') continue;
    const uid   = getP('UID');
    const recId = getP('RECURRENCE-ID');
    if (!uid || !recId) continue;
    const ds = recId.replace(/T.*/, ''); // first 8 chars: YYYYMMDD
    cancelledInstances.add(`${uid}:${ds.substring(0,4)}-${ds.substring(4,6)}-${ds.substring(6,8)}`);
  }

  for (const block of vevents) {
    // Skip cancelled instance overrides — they are not real events
    const status = block.match(/^STATUS(?:;[^:]*)?:(.+)$/m)?.[1]?.trim();
    if (status === 'CANCELLED') continue;
    // Get the value of a property (stripping any ;param=value parameters)
    const getProp = (key) => {
      const m = block.match(new RegExp(`^${key}(?:;[^:]*)?:(.+)$`, 'm'));
      return m ? m[1].trim() : null;
    };

    // Get a specific parameter from a property line (e.g. TZID from DTSTART;TZID=America/Chicago:...)
    const getParam = (key, param) => {
      const m = block.match(new RegExp(`^${key};[^:]*?${param}=([^;:\r\n]+)`, 'm'));
      return m ? m[1].trim() : null;
    };

    const dtstart = getProp('DTSTART');
    if (!dtstart) continue;

    const rruleStr  = getProp('RRULE');
    const exdateStr = getProp('EXDATE');
    const dtend     = getProp('DTEND');
    const uid       = getProp('UID') || '';
    const isAllDay  = /^\d{8}$/.test(dtstart);

    // Determine the timezone for this event's DTSTART
    const eventTzid = getParam('DTSTART', 'TZID') ||
                      (dtstart.endsWith('Z') ? 'UTC' : defaultTz);

    let rawDate = null;
    let start, end;

    if (isAllDay) {
      rawDate = `${dtstart.substring(0,4)}-${dtstart.substring(4,6)}-${dtstart.substring(6,8)}`;
      const endStr  = dtend || dtstart;
      const endDate = `${endStr.substring(0,4)}-${endStr.substring(4,6)}-${endStr.substring(6,8)}`;

      if (rruleStr) {
        // Recurring all-day: check if isoDate is a valid occurrence
        if (!isAllDayOccurrence(rawDate, endDate, rruleStr, exdateStr, isoDate)) continue;
        if (cancelledInstances.has(`${uid}:${isoDate}`)) continue;
        rawDate = isoDate;
        start   = new Date(`${isoDate}T00:00:00`);
        end     = new Date(`${isoDate}T00:00:00`);
      } else {
        // Single / multi-day: include if isoDate falls within [rawDate, endDate)
        if (isoDate < rawDate || isoDate >= endDate) continue;
        start = new Date(`${rawDate}T00:00:00`);
        end   = new Date(`${endDate}T00:00:00`);
      }
    } else {
      if (rruleStr) {
        // Recurring timed event: find the single occurrence on isoDate
        const occ = getTimedOccurrenceOnDate(dtstart, eventTzid, rruleStr, exdateStr, dtend, isoDate, defaultTz);
        if (!occ) continue;
        if (cancelledInstances.has(`${uid}:${isoDate}`)) continue;
        ({ start, end } = occ);
      } else {
        // Non-recurring timed event — pass through; orchestrator filters by date
        start = parseICalDate(dtstart);
        end   = dtend ? parseICalDate(dtend) : start;
      }
    }

    events.push({
      title:    (getProp('SUMMARY') || '(No title)').replace(/\\,/g, ',').replace(/\\n/g, ' ').replace(/\\;/g, ';'),
      start:    start.toISOString(),
      end:      end.toISOString(),
      timezone: defaultTz,
      rawDate,
      location: (getProp('LOCATION')    || '').replace(/\\n/g, ' ').replace(/\\,/g, ','),
      notes:    (getProp('DESCRIPTION') || '').replace(/\\n/g, '\n').replace(/\\,/g, ','),
      allDay:   isAllDay,
      calendar: calendarName,
    });
  }

  return events;
}

/**
 * Check whether isoDate is a valid occurrence of an all-day recurring event.
 * @param {string} rawStart - 'YYYY-MM-DD' of DTSTART
 * @param {string} rawEnd   - 'YYYY-MM-DD' of DTEND (exclusive)
 * @param {string} rruleStr - RRULE value, e.g. 'FREQ=WEEKLY;BYDAY=MO'
 * @param {string|null} exdateStr
 * @param {string} isoDate  - 'YYYY-MM-DD' target date
 */
function isAllDayOccurrence(rawStart, rawEnd, rruleStr, exdateStr, isoDate) {
  try {
    const dtstart = new Date(`${rawStart}T00:00:00Z`);
    const rule = new RRule({ ...RRule.parseString(rruleStr), dtstart });

    // Build exclusion set
    const exdates = buildExdateSet(exdateStr, 'UTC');

    // Search a ±1-day window around isoDate
    const from = new Date(`${isoDate}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 1);
    const to = new Date(`${isoDate}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 2);

    for (const occ of rule.between(from, to, true)) {
      const occDate = occ.toISOString().substring(0, 10);
      if (occDate === isoDate && !exdates.has(occDate)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Find the single occurrence of a recurring timed event that falls on isoDate
 * (interpreted in defaultTz). Returns { start, end } as Date objects or null.
 */
function getTimedOccurrenceOnDate(dtstart, eventTzid, rruleStr, exdateStr, dtend, isoDate, defaultTz) {
  try {
    const origStart  = icalToUtc(dtstart, eventTzid);
    const origEnd    = dtend ? icalToUtc(dtend, eventTzid) : null;
    const durationMs = origEnd ? origEnd - origStart : 60 * 60 * 1000;

    const exdates = buildExdateSet(exdateStr, eventTzid);

    const rule = new RRule({ ...RRule.parseString(rruleStr), dtstart: origStart });

    // Search ±1 UTC day around isoDate to safely catch timezone offsets
    const from = new Date(`${isoDate}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 1);
    const to = new Date(`${isoDate}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 2);

    for (const occ of rule.between(from, to, true)) {
      // Check the occurrence falls on isoDate in the display timezone
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: defaultTz }).format(occ);
      if (localDate !== isoDate) continue;
      if (exdates.has(occ.toISOString().substring(0, 10))) continue;
      return { start: occ, end: new Date(occ.getTime() + durationMs) };
    }
    return null;
  } catch (err) {
    console.warn('[ics] RRULE expansion error:', err.message);
    return null;
  }
}

/**
 * Convert an ICS datetime string to a UTC Date, honouring the TZID.
 * For 'Z' suffix or TZID='UTC': parse as UTC.
 * For local time strings: treat as the given TZID.
 */
function icalToUtc(str, tzid) {
  if (str.endsWith('Z') || tzid === 'UTC') return parseICalDate(str);

  const y  = parseInt(str.substring(0, 4));
  const mo = parseInt(str.substring(4, 6)) - 1;
  const d  = parseInt(str.substring(6, 8));
  const h  = str.length >= 13 ? parseInt(str.substring(9, 11))  : 0;
  const mi = str.length >= 13 ? parseInt(str.substring(11, 13)) : 0;
  const s  = str.length >= 15 ? parseInt(str.substring(13, 15)) : 0;

  // Start with the naive UTC interpretation of the local time
  const approx = new Date(Date.UTC(y, mo, d, h, mi, s));

  // Find what that UTC time looks like in tzid, and compute the correction
  const fmt   = new Intl.DateTimeFormat('en-US', {
    timeZone: tzid, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts  = fmt.formatToParts(approx);
  const getP   = (t) => parseInt(parts.find(p => p.type === t).value);
  const gotSec = getP('hour') * 3600 + getP('minute') * 60 + getP('second');
  const wantSec = h * 3600 + mi * 60 + s;

  return new Date(approx.getTime() + (wantSec - gotSec) * 1000);
}

/** Build a Set of excluded date strings (YYYY-MM-DD) from an EXDATE property value. */
function buildExdateSet(exdateStr, tzid) {
  const set = new Set();
  if (!exdateStr) return set;
  for (const ex of exdateStr.split(',')) {
    try { set.add(icalToUtc(ex.trim(), tzid).toISOString().substring(0, 10)); } catch {}
  }
  return set;
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
