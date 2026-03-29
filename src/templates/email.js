'use strict';

const { formatTime } = require('./helpers');

const DEFAULT_PRIMARY = '#1a2e4a';
const DEFAULT_ACCENT  = '#c9a96e';

function buildEmailHTML({ dateStr, city, weather, clothingTip, events, familyName = 'Family', branding = {} }) {
  const primary = branding.primary_color || DEFAULT_PRIMARY;
  const accent  = branding.accent_color  || DEFAULT_ACCENT;
  const logoUrl = branding.logo_url      || '';

  const { condition, high, low, highC, lowC, rainChance } = weather;

  const weatherRows = [
    ['Condition', condition],
    ['High',      `${high}\u00b0F / ${highC}\u00b0C`],
    ['Low',       `${low}\u00b0F / ${lowC}\u00b0C`],
    ['Rain',      `${rainChance}% chance`],
  ].map(([label, val]) =>
    `<tr>`
    + `<td style="padding:4px 16px 4px 0;font-family:Arial,sans-serif;font-size:13px;color:#888;font-weight:700;">${label}</td>`
    + `<td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:${primary};">${val}</td>`
    + `</tr>`
  ).join('');

  const eventsHtml = events.length === 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f7f3;border-radius:6px;">`
      + `<tr><td style="padding:18px 20px;">`
      + `<p style="margin:0;font-family:Georgia,serif;font-size:15px;color:#5a4e42;font-style:italic;text-align:center;">Nothing on the calendar today \u2014 the day is all yours!</p>`
      + `</td></tr></table>`
    : buildEmailEventsTable(events, primary, accent);

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${familyName}" style="display:block;max-height:48px;max-width:160px;margin:0 auto 12px;" />`
    : '';

  return `<!DOCTYPE html>`
    + `<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Daily ${familyName}</title></head>`
    + `<body style="margin:0;padding:0;background-color:#f4f0e8;font-family:Georgia,serif;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f0e8;padding:24px 0;"><tr><td align="center">`
    + `<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">`

    + `<tr><td style="background-color:${primary};border-radius:8px 8px 0 0;padding:36px 40px 28px;text-align:center;">`
    + logoHtml
    + `<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.14em;color:${accent};text-transform:uppercase;">${familyName} Family</p>`
    + `<h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:48px;font-weight:400;color:#ffffff;">The Daily ${familyName}</h1>`
    + `<div style="width:60px;height:1px;background-color:${accent};margin:12px auto;"></div>`
    + `<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#d4c9b8;letter-spacing:0.07em;text-transform:uppercase;">${dateStr} &nbsp;&middot;&nbsp; ${city}</p>`
    + `</td></tr>`

    + `<tr><td style="background-color:${accent};height:4px;"></td></tr>`

    + `<tr><td style="background-color:#ffffff;padding:28px 40px 24px;">`
    + `<table width="100%" cellpadding="0" cellspacing="0"><tr>`
    + `<td style="vertical-align:top;padding-right:24px;width:42%;">`
    + `<p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;color:${accent};text-transform:uppercase;">Weather Forecast</p>`
    + `<p style="margin:0 0 14px;font-family:Georgia,serif;font-size:20px;color:${primary};">${condition}</p>`
    + `<table cellpadding="0" cellspacing="0">${weatherRows}</table>`
    + `</td>`
    + `<td style="vertical-align:top;border-left:1px solid #e8e2d8;padding-left:24px;">`
    + `<p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;color:${accent};text-transform:uppercase;">What to Wear</p>`
    + `<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.85;color:#3a3530;">${clothingTip}</p>`
    + `</td>`
    + `</tr></table>`
    + `</td></tr>`

    + `<tr><td style="background-color:#f4f0e8;height:3px;"></td></tr>`

    + `<tr><td style="background-color:#ffffff;padding:28px 40px 32px;">`
    + `<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;color:${accent};text-transform:uppercase;">Today's Program</p>`
    + eventsHtml
    + `</td></tr>`

    + `<tr><td style="background-color:${accent};height:3px;"></td></tr>`

    + `<tr><td style="background-color:${primary};padding:24px 40px;text-align:center;">`
    + `<p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#8a9ab5;">Enjoy the day \u2014 make it a great one!</p>`
    + `</td></tr>`

    + `<tr><td style="background-color:${adjustDark(primary)};border-radius:0 0 8px 8px;padding:14px 40px;text-align:center;">`
    + `<p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#5a6a80;letter-spacing:0.06em;text-transform:uppercase;">${familyName} Family Daily &nbsp;&middot;&nbsp; ${dateStr}</p>`
    + `</td></tr>`

    + `</table></td></tr></table>`
    + `</body></html>`;
}

function buildEmailEventsTable(events, primary, accent) {
  const headerStyle = `padding:8px 10px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;`
    + `letter-spacing:0.1em;text-transform:uppercase;color:#fff;background-color:${primary};text-align:left;`;

  const rows = events.map(event => renderEmailEventRow(event, primary, accent)).join('');

  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">`
    + `<thead><tr>`
    + `<th style="${headerStyle}width:110px;">Time</th>`
    + `<th style="${headerStyle}">Event</th>`
    + `<th style="${headerStyle}width:140px;">Location</th>`
    + `</tr></thead>`
    + `<tbody>${rows}</tbody>`
    + `</table>`;
}

function renderEmailEventRow(event, primary, accent) {
  const rowBase = `border-bottom:1px solid #ede8e0;`;

  if (event.isDeparture) {
    return `<tr style="${rowBase}opacity:0.55;">`
      + `<td style="padding:10px 10px 10px 12px;vertical-align:top;border-left:3px solid #ddd;font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#aaa;">${formatTime(event.start, event.timezone)}</td>`
      + `<td style="padding:10px;vertical-align:top;" colspan="2">`
      + `<p style="margin:0 0 2px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#888;">${event.title}</p>`
      + `<p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#aaa;font-style:italic;">${event.notes}</p>`
      + `</td>`
      + `</tr>`;
  }

  if (event.allDay) {
    return `<tr style="${rowBase}background-color:#f9f7f3;">`
      + `<td style="padding:10px 10px 10px 12px;vertical-align:top;border-left:3px solid ${accent};font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:0.08em;">All Day</td>`
      + `<td style="padding:10px;vertical-align:top;">`
      + `<p style="margin:0;font-family:Georgia,serif;font-size:15px;color:${primary};">${event.title}</p>`
      + `</td>`
      + `<td style="padding:10px;vertical-align:top;font-family:Arial,sans-serif;font-size:12px;color:#999;">${event.location || ''}</td>`
      + `</tr>`;
  }

  const blurb = event.notes || event.generatedBlurb || '';
  const isFlight    = /flight|depart|arrive|airline|airways/i.test(event.title);
  const borderColor = isFlight ? '#9a7c3a' : accent;
  const rowBg       = isFlight ? 'background-color:#fdf9f3;' : '';

  return `<tr style="${rowBase}${rowBg}">`
    + `<td style="padding:12px 10px 12px 12px;vertical-align:top;border-left:3px solid ${borderColor};width:110px;">`
    + `<p style="margin:0;font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:${primary};">${formatTime(event.start, event.timezone)}</p>`
    + `<p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:11px;color:#aaa;">to ${formatTime(event.end, event.timezone)}</p>`
    + `<p style="margin:5px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#ccc;text-transform:uppercase;">${event.calendar}</p>`
    + `</td>`
    + `<td style="padding:12px 10px;vertical-align:top;">`
    + `<p style="margin:0 0 4px;font-family:Georgia,serif;font-size:15px;color:${primary};">${event.title}</p>`
    + (blurb ? `<p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#777;line-height:1.65;">${blurb}</p>` : '')
    + `</td>`
    + `<td style="padding:12px 10px;vertical-align:top;font-family:Arial,sans-serif;font-size:12px;color:#999;">${event.location || ''}</td>`
    + `</tr>`;
}

/** Darken a hex color slightly for the footer band */
function adjustDark(hex) {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (n >> 16 & 255) - 20);
    const g = Math.max(0, (n >>  8 & 255) - 20);
    const b = Math.max(0, (n       & 255) - 20);
    return `#${[r,g,b].map(v => v.toString(16).padStart(2,'0')).join('')}`;
  } catch { return hex; }
}

module.exports = { buildEmailHTML };
