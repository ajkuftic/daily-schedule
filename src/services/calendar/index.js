'use strict';

const { fetchCalDAVEvents } = require('./caldav');
const { fetchICSEvents }    = require('./ics');

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
  const credentialUpdates = []; // kept for API compatibility — always empty now
  const seen = new Set();

  for (const account of accounts) {
    try {
      let events = [];

      switch (account.provider) {
        case 'caldav': {
          events = await fetchCalDAVEvents({
            credentials: account.credentials,
            metadata:    account.metadata,
            dayStart, dayEnd, isoDate, defaultTz,
          });
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

      // Tag events with their source account, then deduplicate and collect
      for (const e of events) {
        const key = `${e.title}|${e.start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allEvents.push({ ...e, calendarAccountId: account.id });
      }
    } catch (err) {
      console.error(`[calendar] Error fetching account ${account.id} (${account.provider}):`, err.message);
    }
  }

  // Filter timed events to isoDate (all-day events are already filtered by their fetchers)
  const filtered = allEvents.filter(e => {
    if (e.allDay) return true;
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
