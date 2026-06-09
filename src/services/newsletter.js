'use strict';

const { fetchAllEvents }           = require('./calendar/index');
const { fetchWeather }             = require('./weather');
const { resolveWeatherLocation, buildClothingTip } = require('./location');
const { enrichEventsWithBlurbs }   = require('./claude');
const { generatePDF }              = require('./pdf');
const { uploadPDF, generateLink }  = require('./storage/index');
const { sendEmail }                = require('./email/index');
const { sendIftttEmail }           = require('./ifttt');
const { buildEmailHTML }           = require('../templates/email');
const { buildPrintHTML }           = require('../templates/print');
const { getSeasonalTheme }         = require('./seasonal');
const db = require('../db/index');

function buildWebhookPayload(template, vars) {
  if (!template || !template.trim()) return vars; // default: send raw object
  try {
    let str = template;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? ''));
    }
    return JSON.parse(str);
  } catch {
    return vars; // fallback to default if template is invalid JSON
  }
}

/**
 * Build newsletter content (events, weather, HTML) without sending.
 * Used by both sendDailyNewsletter and the preview route.
 *
 * @param {object} config   - result of db.getAllConfig()
 * @returns {Promise<{ emailHtml, printHtml, isoDate, dateStr, weather, renderEvents, clothingTip, credentialUpdates }>}
 */
async function buildNewsletterContent(config, { targetDate } = {}) {
  const timezone   = config.timezone || 'America/New_York';
  const familyName = config.family_name || 'Family';

  // ── Determine target date (tomorrow in the user's timezone, or override) ──
  let isoDate;
  if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    isoDate = targetDate;
  } else {
    const now       = new Date();
    const todayStr  = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
    const [y, m, d] = todayStr.split('-').map(Number);
    isoDate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().substring(0, 10);
  }
  const nextD = new Date(`${isoDate}T12:00:00Z`);
  const dateStr   = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(nextD);

  const dayStart = new Date(`${isoDate}T00:00:00Z`);
  const dayEnd   = new Date(`${isoDate}T23:59:59Z`);
  dayEnd.setTime(dayEnd.getTime() + 14 * 60 * 60 * 1000);

  console.log(`[newsletter] Target date: ${isoDate} (${dateStr})`);

  // ── Fetch events ──────────────────────────────────────────────
  const calendarAccounts = db.getCalendarAccounts();
  const { events, credentialUpdates } = await fetchAllEvents(
    calendarAccounts, dayStart, dayEnd, isoDate, timezone
  );
  console.log(`[newsletter] Events: ${events.length}`);

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
  await enrichEventsWithBlurbs(events, location.city, dateStr, config.claude_api_key, isoDate);

  // ── Inject departure reminders ────────────────────────────────
  const renderEvents = injectDepartureEvents(events);

  // ── Build HTML ────────────────────────────────────────────────
  const branding = {
    primary_color: config.branding_primary_color || '',
    accent_color:  config.branding_accent_color  || '',
    logo_url:      config.branding_logo_url       || '',
  };

  // Apply seasonal theme overrides if enabled
  if (config.seasonal_themes_enabled === '1') {
    const seasonal = getSeasonalTheme(isoDate);
    if (seasonal) {
      branding.primary_color = seasonal.primary_color;
      branding.accent_color  = seasonal.accent_color;
    }
  }

  const emailHtml = buildEmailHTML({ dateStr, city: location.city, weather, clothingTip, events: renderEvents, familyName, branding });
  const printHtml = buildPrintHTML({ dateStr, city: location.city, weather, clothingTip, events: renderEvents, familyName, branding });

  return { emailHtml, printHtml, isoDate, dateStr, weather, renderEvents, clothingTip, timezone, credentialUpdates };
}

/**
 * Build and send the daily newsletter.
 * Called by the scheduler and the "Send Now" / "Test Send" APIs.
 *
 * @param {object} config              - result of db.getAllConfig()
 * @param {object} [options]
 * @param {string} [options.testEmail] - if set, send only to this address; skips
 *                                       printer CC, storage upload, and webhooks
 * @param {string} [options.targetDate] - override the newsletter date (YYYY-MM-DD)
 */
async function sendFailureAlert(config, errorMessage) {
  const alertEmail = config.alert_email;
  if (!alertEmail) return;
  const emailAccount = db.getEmailAccount();
  if (!emailAccount) return;
  try {
    const { sendEmail: sendEmailFn } = require('./email/index');
    await sendEmailFn({
      emailAccount,
      to: alertEmail,
      subject: `[Daily Schedule] Send failed`,
      htmlBody: `<p>The daily newsletter failed to send.</p><pre>${errorMessage}</pre>`,
      fromName: config.from_name || `Daily ${config.family_name || 'Schedule'}`,
    });
    console.log(`[newsletter] Failure alert sent to ${alertEmail}`);
  } catch (e) {
    console.error('[newsletter] Failed to send alert email:', e.message);
  }
}

async function sendDailyNewsletter(config, { testEmail, targetDate } = {}) {
  const isTest     = !!testEmail;
  const familyName = config.family_name || 'Family';
  const fromName   = config.from_name || `The Daily ${familyName}`;

  try {

  const { emailHtml, printHtml, isoDate, dateStr, weather, renderEvents, clothingTip, timezone, credentialUpdates } =
    await buildNewsletterContent(config, { targetDate });

  // Persist any refreshed calendar OAuth tokens
  for (const { accountId, credentials } of credentialUpdates) {
    db.upsertCalendarAccount({ ...db.getCalendarAccount(accountId), credentials });
  }

  // ── Generate PDF ──────────────────────────────────────────────
  const subjectBase = `Daily ${familyName} – ${dateStr}`;
  const subject     = isTest ? `[TEST] ${subjectBase}` : subjectBase;
  const pdfLabel    = `Daily ${familyName} ${dateStr}`;
  const pdf = await generatePDF(printHtml, pdfLabel, config.html2pdf_api_key);

  // ── Determine recipients ──────────────────────────────────────
  const emailAccount = db.getEmailAccount();
  if (!emailAccount) throw new Error('No email account configured');

  let sendTo; // string or array of emails for logging
  if (isTest) {
    // Test send: single address
    const attachments = pdf ? [pdf] : [];
    const { refreshedCredentials: refreshedEmailCreds } = await sendEmail({
      emailAccount, to: testEmail, subject, htmlBody: emailHtml, fromName, attachments,
    });
    if (refreshedEmailCreds) {
      db.updateEmailCredentials({ ...emailAccount.credentials, ...refreshedEmailCreds });
      console.log('[newsletter] Gmail token refreshed and persisted');
    }
    sendTo = testEmail;
    db.logSend(isoDate, 'test', `Test send to ${sendTo}`);
    console.log(`[newsletter] Test send for ${dateStr} → ${sendTo}${pdf ? ' with PDF' : ''}`);
  } else {
    // Real send: use recipients table
    const recipients = db.getRecipients().filter(r => r.active);
    if (recipients.length === 0) {
      // Fallback to config.send_to if no recipients configured
      const fallbackTo = config.send_to;
      if (!fallbackTo) throw new Error('No active recipients configured');
      const attachments = pdf ? [pdf] : [];
      const cc = pdf && config.epson_connect_email && config.epson_enabled === '1'
        ? config.epson_connect_email : undefined;
      await sendEmail({ emailAccount, to: fallbackTo, subject, htmlBody: emailHtml, fromName, attachments, cc });
      sendTo = fallbackTo;
    } else {
      const withPdf    = recipients.filter(r => r.include_pdf).map(r => r.email);
      const withoutPdf = recipients.filter(r => !r.include_pdf).map(r => r.email);
      const cc = pdf && config.epson_connect_email && config.epson_enabled === '1'
        ? config.epson_connect_email : undefined;

      let refreshedEmailCreds;
      if (withPdf.length > 0) {
        const attachments = pdf ? [pdf] : [];
        const result = await sendEmail({ emailAccount, to: withPdf, subject, htmlBody: emailHtml, fromName, attachments, cc });
        refreshedEmailCreds = result.refreshedCredentials;
      }
      if (withoutPdf.length > 0) {
        const result = await sendEmail({ emailAccount, to: withoutPdf, subject, htmlBody: emailHtml, fromName, attachments: [] });
        if (result.refreshedCredentials) refreshedEmailCreds = result.refreshedCredentials;
      }
      if (refreshedEmailCreds) {
        db.updateEmailCredentials({ ...emailAccount.credentials, ...refreshedEmailCreds });
        console.log('[newsletter] Gmail token refreshed and persisted');
      }
      sendTo = recipients.map(r => r.email).join(', ');
    }
    db.logSend(isoDate, 'success', `Sent to ${sendTo}`);
    console.log(`[newsletter] Sent for ${dateStr} → ${sendTo}${pdf ? ' with PDF' : ''}`);
  }

  // ── Cloud / local storage (skipped for test sends) ────────────
  let pdfUrl = null;
  if (pdf && !isTest) {
    const uploadResult = await uploadPDF(pdf.buffer, pdf.filename, config);
    if (uploadResult) {
      pdfUrl = generateLink(pdf.filename, config.storage_provider, config, uploadResult.url);
      db.logPdfUpload(pdf.filename, isoDate, config.storage_provider, uploadResult.url || null);
    }
  }

  // ── Outgoing notify webhook (skipped for test sends) ──────────
  if (!isTest) {
    const webhookUrl = config.webhook_outgoing_url;
    if (webhookUrl) {
      const webhookVars = { date: isoDate, dateStr, status: 'success', subject, sentTo: sendTo, pdfUrl: pdfUrl || '' };
      const notifyPayload = buildWebhookPayload(config.webhook_outgoing_template, webhookVars);
      fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(notifyPayload),
        signal:  AbortSignal.timeout(10_000),
      }).catch(err => console.error('[webhook] Outgoing notify failed:', err.message));
    }

    // ── Distribution webhook ────────────────────────────────────
    const distUrl    = config.webhook_distribution_url;
    const distSecret = config.webhook_distribution_secret;
    if (distUrl) {
      const headers = { 'Content-Type': 'application/json' };
      if (distSecret) headers['Authorization'] = `Bearer ${distSecret}`;
      const payload = {
        date:       isoDate,
        dateStr,
        subject,
        familyName,
        html:       emailHtml,
      };
      fetch(distUrl, {
        method:  'POST',
        headers,
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(15_000),
      })
        .then(r => console.log(`[webhook] Distribution delivered — HTTP ${r.status}`))
        .catch(err => console.error('[webhook] Distribution failed:', err.message));
    }

    // ── IFTTT trigger email ─────────────────────────────────────
    if (config.ifttt_enabled === '1') {
      sendIftttEmail({
        emailAccount,
        fromName,
        dateStr,
        weather,
        events: renderEvents,
        clothingTip,
        pdf,
        timezone,
      }).catch(err => console.error('[ifttt] Trigger email failed:', err.message));
    }
  }

  } catch (err) {
    console.error('[newsletter] Send failed:', err.message);
    await sendFailureAlert(config, err.message);
    db.logSend(new Date().toISOString().substring(0, 10), 'error', err.message);
    throw err;
  }
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

module.exports = { sendDailyNewsletter, buildNewsletterContent };
