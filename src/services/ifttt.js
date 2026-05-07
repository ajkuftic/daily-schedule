'use strict';

/**
 * IFTTT email trigger integration.
 *
 * Sends a plain-text email to trigger@applet.ifttt.com after each newsletter.
 * IFTTT uses the subject, body, and attachment as ingredients in applets.
 *
 * Subject format:  {From Name} - {date of newsletter}
 * Body format:     Plain text — weather, clothing tip, schedule
 * Attachment:      The newsletter PDF (IFTTT will make it available as a link)
 *
 * Config keys:
 *   ifttt_enabled   '1' to enable
 */

const { sendEmail } = require('./email/index');

function formatTime(isoString, timezone) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour:   'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone || 'UTC',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

/**
 * Build the plain-text body in the format IFTTT can ingest.
 *
 * @param {object} weather      - { condition, high, highC, low, lowC, rainChance }
 * @param {Array}  events       - renderEvents array (with departure events injected)
 * @param {string} clothingTip  - one-sentence clothing recommendation
 * @param {string} timezone     - IANA timezone string for formatting times
 */
function buildPlainText(weather, events, clothingTip, timezone) {
  const lines = [];

  // ── Weather ───────────────────────────────────────────────────
  lines.push('Weather:');
  lines.push(`Condition: ${weather.condition}`);
  lines.push(`High: ${weather.high}°F / ${weather.highC}°C`);
  lines.push(`Low: ${weather.low}°F / ${weather.lowC}°C`);
  lines.push(`Rain Chance: ${weather.rainChance}% chance of rain`);

  // ── Clothing tip ──────────────────────────────────────────────
  if (clothingTip) {
    lines.push('');
    lines.push('What should you wear?');
    lines.push(clothingTip);
  }

  // ── Schedule ──────────────────────────────────────────────────
  lines.push('');
  lines.push('Schedule:');

  // All-day events first (no time prefix)
  const allDayEvents = events.filter(e => e.allDay);
  for (const ev of allDayEvents) {
    lines.push(`All day — ${ev.title}`);
  }

  // Timed events sorted by start time
  const timedEvents = events
    .filter(e => !e.allDay)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  for (const ev of timedEvents) {
    const time = formatTime(ev.start, timezone || ev.timezone);
    lines.push(`${time} — ${ev.title}`);
  }

  return lines.join('\n');
}

/**
 * Send the IFTTT trigger email.
 *
 * @param {object} opts
 * @param {object} opts.emailAccount  - db email account record
 * @param {string} opts.fromName      - e.g. "The Daily Smith"
 * @param {string} opts.dateStr       - e.g. "Wednesday, May 7, 2026"
 * @param {object} opts.weather       - weather object from fetchWeather()
 * @param {Array}  opts.events        - renderEvents (all-day + timed + departures)
 * @param {string} opts.clothingTip   - clothing recommendation string
 * @param {object} [opts.pdf]         - { buffer, filename } or null
 * @param {string} opts.timezone      - IANA timezone for time formatting
 */
async function sendIftttEmail({ emailAccount, fromName, dateStr, weather, events, clothingTip, pdf, timezone }) {
  const subject     = `${fromName} - ${dateStr}`;
  const textBody    = buildPlainText(weather, events, clothingTip, timezone);
  const attachments = pdf ? [pdf] : [];

  await sendEmail({
    emailAccount,
    to:        'trigger@applet.ifttt.com',
    subject,
    textBody,
    fromName,
    attachments,
  });

  console.log(`[ifttt] Trigger email sent: "${subject}"`);
}

module.exports = { sendIftttEmail, buildPlainText };
