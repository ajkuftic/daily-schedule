'use strict';

const { formatTime } = require('./helpers');

function buildPrintHTML({ dateStr, city, weather, clothingTip, events, familyName = 'Family' }) {
  const { condition, high, low, highC, lowC, rainChance } = weather;

  const weatherGrid = [
    ['Condition', condition],
    ['High',      `${high}\u00b0F / ${highC}\u00b0C`],
    ['Low',       `${low}\u00b0F / ${lowC}\u00b0C`],
    ['Rain',      `${rainChance}% chance`],
  ].map(([label, val]) =>
    `<tr>`
    + `<td style="width:90px;font-size:11pt;font-weight:bold;color:#555;padding:3px 12px 3px 0;">${label}</td>`
    + `<td style="font-size:11pt;color:#111;padding:3px 0;">${val}</td>`
    + `</tr>`
  ).join('');

  const eventsSection = events.length === 0
    ? `<p style="font-style:italic;color:#555;font-size:12pt;margin:16px 0;">Nothing on the calendar today \u2014 the day is all yours!</p>`
    : events.map(event => renderPrintEvent(event)).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">`
    + `<style>`
    + `  html, body { margin: 0; padding: 0; }`
    + `  * { box-sizing: border-box; -webkit-print-color-adjust: exact; }`
    + `  body { font-family: Georgia, serif; color: #111; background: #fff; }`
    + `  h1 { margin-top: 0; padding-top: 0; }`
    + `  .header { border-bottom: 3px solid #1a2e4a; padding-bottom: 10px; margin-bottom: 18px; }`
    + `  .header-title { font-size: 28pt; font-weight: normal; color: #1a2e4a; margin: 0; padding: 0; }`
    + `  .header-sub { font-size: 10pt; color: #555; letter-spacing: 0.1em; text-transform: uppercase; margin: 4px 0 0; }`
    + `  .gold-rule { border: none; border-top: 1.5px solid #c9a96e; margin: 14px 0; }`
    + `  .section-label { font-family: Arial, sans-serif; font-size: 9pt; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; color: #c9a96e; margin: 0 0 10px; }`
    + `  .two-col { display: flex; gap: 28px; margin-bottom: 18px; }`
    + `  .two-col > div { flex: 1; }`
    + `  .clothing { font-size: 11.5pt; line-height: 1.75; color: #222; }`
    + `  .footer { margin-top: 24px; border-top: 1px solid #1a2e4a; padding-top: 8px; text-align: center; font-family: Arial, sans-serif; font-size: 8.5pt; color: #777; letter-spacing: 0.07em; text-transform: uppercase; }`
    + `</style>`
    + `</head><body>`

    + `<div class="header" style="padding-top:0;margin-top:0;">`
    + `<div style="display:flex;justify-content:space-between;align-items:flex-end;">`
    + `<div>`
    + `<h1 class="header-title">The Daily ${familyName}</h1>`
    + `<p class="header-sub">${familyName} Family &nbsp;&middot;&nbsp; ${dateStr} &nbsp;&middot;&nbsp; ${city}</p>`
    + `</div>`
    + `</div>`
    + `</div>`

    + `<div class="two-col">`
    + `<div>`
    + `<p class="section-label">Weather Forecast</p>`
    + `<p style="font-size:15pt;color:#1a2e4a;margin:0 0 10px;">${condition}</p>`
    + `<table cellpadding="0" cellspacing="0">${weatherGrid}</table>`
    + `</div>`
    + `<div style="border-left:1px solid #ddd;padding-left:24px;">`
    + `<p class="section-label">What to Wear</p>`
    + `<p class="clothing">${clothingTip}</p>`
    + `</div>`
    + `</div>`

    + `<hr class="gold-rule">`
    + `<p class="section-label">Today's Program</p>`
    + eventsSection

    + `<div class="footer">${familyName} Family Daily &nbsp;&middot;&nbsp; ${dateStr}</div>`

    + `<script src="https://cdn.jsdelivr.net/npm/twemoji@14/dist/twemoji.min.js" crossorigin="anonymous"></script>`
    + `<script>twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });</script>`

    + `</body></html>`;
}

function renderPrintEvent(event) {
  if (event.isDeparture) {
    return `<div style="display:flex;margin-bottom:10px;padding-bottom:10px;border-bottom:0.5px solid #eee;opacity:0.7;">`
      + `<div style="width:110px;flex-shrink:0;padding-right:14px;border-right:2px solid #ddd;">`
      + `<div style="font-size:11pt;font-weight:bold;color:#aaa;">${formatTime(event.start, event.timezone)}</div>`
      + `</div>`
      + `<div style="flex:1;padding-left:14px;">`
      + `<div style="font-size:11pt;color:#888;font-weight:bold;">${event.title}</div>`
      + `<div style="font-size:9.5pt;color:#aaa;font-style:italic;margin-top:2px;">${event.notes}</div>`
      + `</div>`
      + `</div>`;
  }

  if (event.allDay) {
    return `<div style="margin-bottom:12px;padding:8px 12px;background:#f9f7f3;border-left:2.5px solid #c9a96e;">`
      + `<div style="font-size:8.5pt;font-weight:bold;color:#c9a96e;text-transform:uppercase;letter-spacing:0.08em;">All Day</div>`
      + `<div style="font-size:12.5pt;color:#1a2e4a;font-weight:bold;margin-top:2px;">${event.title}</div>`
      + (event.location ? `<div style="font-size:10pt;color:#555;margin-top:2px;">&#9679; ${event.location}</div>` : '')
      + `</div>`;
  }

  const timeStart = formatTime(event.start, event.timezone);
  const timeEnd   = formatTime(event.end,   event.timezone);
  const blurb     = event.notes || event.generatedBlurb || '';
  const isFlight  = /flight|depart|arrive|airline|airways/i.test(event.title);
  const border    = isFlight ? '#9a7c3a' : '#1a2e4a';

  return `<div style="display:flex;margin-bottom:14px;padding-bottom:14px;border-bottom:0.5px solid #ddd;">`
    + `<div style="width:110px;flex-shrink:0;padding-right:14px;border-right:2.5px solid ${border};">`
    + `<div style="font-size:11pt;font-weight:bold;color:#1a2e4a;">${timeStart}</div>`
    + `<div style="font-size:9.5pt;color:#777;">to ${timeEnd}</div>`
    + `<div style="font-size:8.5pt;color:#aaa;text-transform:uppercase;margin-top:3px;">${event.calendar}</div>`
    + `</div>`
    + `<div style="flex:1;padding-left:14px;">`
    + `<div style="font-size:12.5pt;color:#1a2e4a;font-weight:bold;margin-bottom:2px;">${event.title}</div>`
    + (event.location ? `<div style="font-size:10pt;color:#555;margin:2px 0 4px;">&#9679; ${event.location}</div>` : '')
    + (blurb ? `<div style="font-size:10.5pt;color:#333;line-height:1.55;margin-top:3px;">${blurb}</div>` : '')
    + `</div>`
    + `</div>`;
}

module.exports = { buildPrintHTML };
