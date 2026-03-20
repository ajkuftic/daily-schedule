'use strict';

const { fetchAllEvents }           = require('./calendar/index');
const { fetchWeather }             = require('./weather');
const { resolveWeatherLocation, buildClothingTip } = require('./location');
const { enrichEventsWithBlurbs }   = require('./claude');
const { generatePDF }              = require('./pdf');
const { sendEmail }                = require('./email/index');
const { buildEmailHTML }           = require('../templates/email');
const { buildPrintHTML }           = require('../templates/print');
const db = require('../db/index');

/**
 * Build and send the daily newsletter.
 * This is the main orchestration function — called by the scheduler and the "Send Now" API.
 *
 * @param {object} config   - result of db.getAllConfig()
 * @returns {Promise<void>}
 */
async function sendDailyNewsletter(config) {
  const timezone    = config.timezone || 'America/New_York';
  const familyName  = config.family_name || 'Family';
  const sendTo      = config.send_to;
  const fromName    = config.from_name  || `The Daily ${familyName}`;

  // ── Determine target date (tomorrow in the user's timezone) ──
  const now        = new Date();
  const todayStr   = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  const [y, m, d]  = todayStr.split('-').map(Number);
  const nextD      = new Date(Date.UTC(y, m - 1, d + 1));
  const isoDate    = nextD.toISOString().substring(0, 10);
  const dateStr    = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(nextD);

  const dayStart = new Date(`${isoDate}T00:00:00Z`);
  const dayEnd   = new Date(`${isoDate}T23:59:59Z`);
  dayEnd.setTime(dayEnd.getTime() + 14 * 60 * 60 * 1000); // extend for late-timezone events

  console.log(`[newsletter] Target date: ${isoDate} (${dateStr})`);

  // ── Fetch events ──────────────────────────────────────────────
  const calendarAccounts = db.getCalendarAccounts();
  const { events, credentialUpdates } = await fetchAllEvents(
    calendarAccounts, dayStart, dayEnd, isoDate, timezone
  );
  console.log(`[newsletter] Events: ${events.length}`);

  // Persist any refreshed OAuth tokens
  for (const { accountId, credentials } of credentialUpdates) {
    db.upsertCalendarAccount({ ...db.getCalendarAccount(accountId), credentials });
  }

  // ── Weather ───────────────────────────────────────────────────
  const location = resolveWeatherLocation(
    events,
    config.default_city || 'Pittsburgh, PA',
    parseFloat(config.default_lat) || 40.4406,
    parseFloat(config.default_lon) || -79.9959,
  );
  console.log(`[newsletter] Location: ${location.city}`);

  const weather = await fetchWeather(location.lat, location.lon, isoDate);
  console.log(`[newsletter] Weather: ${weather.condition}, ${weather.high}°F`);

  const clothingTip = buildClothingTip(weather, events);

  // ── Claude blurbs ─────────────────────────────────────────────
  await enrichEventsWithBlurbs(events, location.city, dateStr, config.claude_api_key);

  // ── Inject departure reminders ────────────────────────────────
  const renderEvents = injectDepartureEvents(events);

  // ── Build HTML ────────────────────────────────────────────────
  const emailHtml = buildEmailHTML({ dateStr, city: location.city, weather, clothingTip, events: renderEvents, familyName });
  const printHtml = buildPrintHTML({  dateStr, city: location.city, weather, clothingTip, events: renderEvents, familyName });

  // ── Generate PDF ──────────────────────────────────────────────
  const subject  = `Daily ${familyName} \u2013 ${dateStr}`;
  const pdfLabel = `Daily ${familyName} ${dateStr}`;
  const pdf = await generatePDF(printHtml, pdfLabel, config.html2pdf_api_key);

  // ── Send email ────────────────────────────────────────────────
  const emailAccount = db.getEmailAccount();
  if (!emailAccount) throw new Error('No email account configured');

  const attachments = pdf ? [pdf] : [];
  const cc = pdf && config.epson_connect_email ? config.epson_connect_email : undefined;

  await sendEmail({ emailAccount, to: sendTo, subject, htmlBody: emailHtml, fromName, attachments, cc });

  db.logSend(isoDate, 'success', `Sent to ${sendTo}`);
  console.log(`[newsletter] Sent for ${dateStr}${pdf ? ' with PDF' : ''}`);
}

function injectDepartureEvents(events) {
  const result = [];

  for (const event of events) {
    if (!event.allDay && event.travelDuration && event.start) {
      const match   = event.travelDuration.match(/(\d+)\s*min/i);
      const minutes = (match ? parseInt(match[1], 10) : 30) + 15;

      const departureMs   = new Date(event.start).getTime() - minutes * 60 * 1000;
      const departureTime = new Date(departureMs).toISOString();
      const destination   = event.location || event.title;

      result.push({
        title:       `Leave for ${event.title}`,
        start:       departureTime,
        end:         departureTime,
        timezone:    event.timezone,
        location:    '',
        notes:       `You'll need ${event.travelDuration.toLowerCase()} to get to ${destination}.`,
        allDay:      false,
        calendar:    '',
        isDeparture: true,
      });
    }

    result.push(event);
  }

  return result;
}

module.exports = { sendDailyNewsletter };
