'use strict';

const { fetchGoogleCalendarEvents } = require('./google');
const { fetchCalDAVEvents }         = require('./caldav');
const { fetchOutlookCalendarEvents } = require('./outlook');
const { fetchICSEvents }            = require('./ics');

/**
 * Fetch and normalize events from all configured calendar accounts.
 *
 * @param {object[]} accounts   - rows from calendar_accounts table
 * @param {Date}     dayStart
 * @param {Date}     dayEnd
 * @param {string}   isoDate    - 'YYYY-MM-DD' target date
 * @param {string}   defaultTz
 * @returns {Promise<{ events: object[], credentialUpdates: object[] }>}
 */
async function fetchAllEvents(accounts, dayStart, dayEnd, isoDate, defaultTz) {
  const allEvents = [];
  const credentialUpdates = []; // [{ accountId, credentials }] — refreshed tokens to persist
  const seen = new Set();

  for (const account of accounts) {
    try {
      let events = [];
      let refreshed = null;

      switch (account.provider) {
        case 'google': {
          const calIds  = account.metadata?.calendarIds || [];
          const remIds  = account.metadata?.reminderCalendarIds || [];
          const calNames = account.metadata?.calendarNames || {};
          const result  = await fetchGoogleCalendarEvents({
            credentials:          account.credentials,
            calendarIds:          calIds,
            reminderCalendarIds:  remIds,
            calendarNames:        calNames,
            dayStart, dayEnd, isoDate, defaultTz,
          });
          events    = result.events;
          refreshed = result.refreshedCredentials;
          break;
        }

        case 'caldav': {
          events = await fetchCalDAVEvents({
            credentials: account.credentials,
            metadata:    account.metadata,
            dayStart, dayEnd, isoDate, defaultTz,
          });
          break;
        }

        case 'outlook': {
          const result = await fetchOutlookCalendarEvents({
            credentials: account.credentials,
            metadata:    account.metadata,
            dayStart, dayEnd, isoDate, defaultTz,
          });
          events    = result.events;
          refreshed = result.refreshedCredentials;
          break;
        }

        case 'ics': {
          events = await fetchICSEvents({
            credentials: account.credentials,
            metadata:    account.metadata,
            isoDate, defaultTz,
          });
          break;
        }

        default:
          console.warn(`[calendar] Unknown provider: ${account.provider}`);
      }

      if (refreshed) credentialUpdates.push({ accountId: account.id, credentials: refreshed });

      // Deduplicate and collect
      for (const e of events) {
        const key = `${e.title}|${e.start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allEvents.push(e);
      }
    } catch (err) {
      console.error(`[calendar] Error fetching account ${account.id} (${account.provider}):`, err.message);
    }
  }

  // Filter to isoDate
  const filtered = allEvents.filter(e => {
    if (e.allDay) return e.rawDate === isoDate;
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: e.timezone || defaultTz }).format(new Date(e.start));
    return localDate === isoDate;
  });

  // Sort: all-day first, then by local clock time
  filtered.sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    if (a.allDay && b.allDay)  return 0;
    return new Date(a.start) - new Date(b.start);
  });

  return { events: filtered, credentialUpdates };
}

module.exports = { fetchAllEvents };
