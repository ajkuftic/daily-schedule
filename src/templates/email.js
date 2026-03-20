'use strict';

const { formatTime } = require('./helpers');

function buildEmailHTML({ dateStr, city, weather, clothingTip, events, familyName = 'Family' }) {
  const { condition, high, low, highC, lowC, rainChance } = weather;

  const weatherRows = [
    ['Condition', condition],
    ['High',      `${high}\u00b0F / ${highC}\u00b0C`],
    ['Low',       `${low}\u00b0F / ${lowC}\u00b0C`],
    ['Rain',      `${rainChance}% chance`],
  ].map(([label, val]) =>
    `<tr>`
    + `<td style="padding:4px 16px 4px 0;font-family:Arial,sans-serif;font-size:13px;color:#888;font-weight:700;">${label}</td>`
    + `<td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#1a2e4a;">${val}</td>`
    + `</tr>`
  ).join('');

  const eventsHtml = events.length === 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f7f3;border-radius:6px;">`
      + `<tr><td style="padding:18px 20px;">`
      + `<p style="margin:0;font-family:Georgia,serif;font-size:15px;color:#5a4e42;font-style:italic;text-align:center;">Nothing on the calendar today \u2014 the day is all yours!</p>`
      + `</td></tr></table>`
    : events.map(event => renderEmailEvent(event)).join('');

  return `<!DOCTYPE html>`
    + `<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Daily ${familyName}</title></head>`
    + `<body style="margin:0;padding:0;background-color:#f4f0e8;font-family:Georgia,serif;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f0e8;padding:24px 0;"><tr><td align="center">`
    + `<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">`

    + `<tr><td style="background-color:#1a2e4a;border-radius:8px 8px 0 0;padding:36px 40px 28px;text-align:center;">`
    + `<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.14em;color:#c9a96e;text-transform:uppercase;">${familyName} Family</p>`
    + `<h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:48px;font-weight:400;color:#ffffff;">The Daily ${familyName}</h1>`
    + `<div style="width:60px;height:1px;background-color:#c9a96e;margin:12px auto;"></div>`
    + `<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#d4c9b8;letter-spacing:0.07em;text-transform:uppercase;">${dateStr} &nbsp;&middot;&nbsp; ${city}</p>`
    + `</td></tr>`

    + `<tr><td style="background-color:#c9a96e;height:4px;"></td></tr>`

    + `<tr><td style="background-color:#ffffff;padding:28px 40px 24px;">`
    + `<table width="100%" cellpadding="0" cellspacing="0"><tr>`
    + `<td style="vertical-align:top;padding-right:24px;width:42%;">`
    + `<p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#c9a96e;text-transform:uppercase;">Weather Forecast</p>`
    + `<p style="margin:0 0 14px;font-family:Georgia,serif;font-size:20px;color:#1a2e4a;">${condition}</p>`
    + `<table cellpadding="0" cellspacing="0">${weatherRows}</table>`
    + `</td>`
    + `<td style="vertical-align:top;border-left:1px solid #e8e2d8;padding-left:24px;">`
    + `<p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#c9a96e;text-transform:uppercase;">What to Wear</p>`
    + `<p style="margin:0;font-family:Georgia,serif;font-size:14px;line-height:1.85;color:#3a3530;">${clothingTip}</p>`
    + `</td>`
    + `</tr></table>`
    + `</td></tr>`

    + `<tr><td style="background-color:#f4f0e8;height:3px;"></td></tr>`

    + `<tr><td style="background-color:#ffffff;padding:28px 40px 32px;">`
    + `<p style="margin:0 0 22px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#c9a96e;text-transform:uppercase;">Today's Program</p>`
    + eventsHtml
    + `</td></tr>`

    + `<tr><td style="background-color:#c9a96e;height:3px;"></td></tr>`

    + `<tr><td style="background-color:#1a2e4a;padding:24px 40px;text-align:center;">`
    + `<p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#8a9ab5;">Enjoy the day \u2014 make it a great one!</p>`
    + `</td></tr>`

    + `<tr><td style="background-color:#12203a;border-radius:0 0 8px 8px;padding:14px 40px;text-align:center;">`
    + `<p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#5a6a80;letter-spacing:0.06em;text-transform:uppercase;">${familyName} Family Daily &nbsp;&middot;&nbsp; ${dateStr}</p>`
    + `</td></tr>`

    + `</table></td></tr></table>`
    + `</body></html>`;
}

function renderEmailEvent(event) {
  if (event.isDeparture) {
    return `<table width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #e8e2d8;margin-bottom:14px;background-color:#fafafa;">`
      + `<tr>`
      + `<td style="width:115px;padding:10px 14px 10px 16px;vertical-align:top;border-right:1px solid #ede8e0;">`
      + `<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#aaa;">${formatTime(event.start, event.timezone)}</p>`
      + `</td>`
      + `<td style="padding:10px 16px;vertical-align:top;">`
      + `<p style="margin:0 0 3px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#888;">${event.title}</p>`
      + `<p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#aaa;font-style:italic;">${event.notes}</p>`
      + `</td>`
      + `</tr></table>`;
  }

  if (event.allDay) {
    return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;background-color:#f9f7f3;border-left:3px solid #c9a96e;">`
      + `<tr><td style="padding:10px 16px;">`
      + `<p style="margin:0;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#c9a96e;text-transform:uppercase;letter-spacing:0.08em;">All Day</p>`
      + `<p style="margin:2px 0 0;font-family:Georgia,serif;font-size:15px;color:#1a2e4a;">${event.title}</p>`
      + (event.location ? `<p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#999;">&#9679; ${event.location}</p>` : '')
      + `</td></tr></table>`;
  }

  const blurb = event.notes || event.generatedBlurb || '';
  const blurbHtml = blurb
    ? `<p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#777;line-height:1.65;">${blurb}</p>`
    : '';
  const locationHtml = event.location
    ? `<p style="margin:0 0 5px;font-family:Arial,sans-serif;font-size:12px;color:#999;">&#9679; ${event.location}</p>`
    : '';
  const isFlight    = /flight|depart|arrive|airline|airways/i.test(event.title);
  const borderColor = isFlight ? '#9a7c3a' : '#c9a96e';
  const rowBg       = isFlight ? 'background-color:#fdf9f3;' : '';

  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid ${borderColor};margin-bottom:14px;${rowBg}">`
    + `<tr>`
    + `<td style="width:115px;padding:12px 14px 12px 16px;vertical-align:top;border-right:1px solid #ede8e0;">`
    + `<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#1a2e4a;">${formatTime(event.start, event.timezone)}</p>`
    + `<p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:11px;color:#aaa;">to ${formatTime(event.end, event.timezone)}</p>`
    + `<p style="margin:5px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#ccc;text-transform:uppercase;">${event.calendar}</p>`
    + `</td>`
    + `<td style="padding:12px 16px;vertical-align:top;">`
    + `<p style="margin:0 0 4px;font-family:Georgia,serif;font-size:16px;color:#1a2e4a;">${event.title}</p>`
    + locationHtml
    + blurbHtml
    + `</td>`
    + `</tr></table>`;
}

module.exports = { buildEmailHTML };
