'use strict';

const { formatTime } = require('./helpers');

const DEFAULT_PRIMARY = '#1a2e4a';
const DEFAULT_ACCENT  = '#c9a96e';

function buildPrintHTML({ dateStr, city, weather, clothingTip, events, familyName = 'Family', branding = {} }) {
  const primary = branding.primary_color || DEFAULT_PRIMARY;
  const accent  = branding.accent_color  || DEFAULT_ACCENT;
  const logoUrl = branding.logo_url      || '';

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
    : buildPrintEventsTable(events, primary, accent);

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${familyName}" style="max-height:40px;max-width:140px;display:block;margin-bottom:6px;" />`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">`
    + `<style>`
    + `  html, body { margin: 0; padding: 0; }`
    + `  * { box-sizing: border-box; -webkit-print-color-adjust: exact; }`
    + `  body { font-family: Georgia, serif; color: #111; background: #fff; }`
    + `  h1 { margin-top: 0; padding-top: 0; }`
    + `  .header { border-bottom: 3px solid ${primary}; padding-bottom: 10px; margin-bottom: 18px; }`
    + `  .header-title { font-size: 28pt; font-weight: normal; color: ${primary}; margin: 0; padding: 0; }`
    + `  .header-sub { font-size: 10pt; color: #555; letter-spacing: 0.1em; text-transform: uppercase; margin: 4px 0 0; }`
    + `  .gold-rule { border: none; border-top: 1.5px solid ${accent}; margin: 14px 0; }`
    + `  .section-label { font-family: Arial, sans-serif; font-size: 9pt; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; color: ${accent}; margin: 0 0 10px; }`
    + `  .two-col { display: flex; gap: 28px; margin-bottom: 18px; }`
    + `  .two-col > div { flex: 1; }`
    + `  .clothing { font-size: 11.5pt; line-height: 1.75; color: #222; }`
    + `  .footer { margin-top: 24px; border-top: 1px solid ${primary}; padding-top: 8px; text-align: center; font-family: Arial, sans-serif; font-size: 8.5pt; color: #777; letter-spacing: 0.07em; text-transform: uppercase; }`
    + `  .evt-table { width: 100%; border-collapse: collapse; }`
    + `  .evt-table th { font-family: Arial, sans-serif; font-size: 8.5pt; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; padding: 6px 8px; background: ${primary}; color: #fff; text-align: left; }`
    + `  .evt-table td { padding: 9px 8px; vertical-align: top; border-bottom: 0.5px solid #ddd; font-size: 10.5pt; }`
    + `  .evt-table .time-cell { width: 100px; border-left: 3px solid ${accent}; padding-left: 10px; }`
    + `  .evt-table .loc-cell { width: 130px; color: #555; font-size: 10pt; }`
    + `</style>`
    + `</head><body>`

    + `<div class="header" style="padding-top:0;margin-top:0;">`
    + `<div style="display:flex;justify-content:space-between;align-items:flex-end;">`
    + `<div>`
    + logoHtml
    + `<h1 class="header-title">The Daily ${familyName}</h1>`
    + `<p class="header-sub">${familyName} Family &nbsp;&middot;&nbsp; ${dateStr} &nbsp;&middot;&nbsp; ${city}</p>`
    + `</div>`
    + `</div>`
    + `</div>`

    + `<div class="two-col">`
    + `<div>`
    + `<p class="section-label">Weather Forecast</p>`
    + `<p style="font-size:15pt;color:${primary};margin:0 0 10px;">${condition}</p>`
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

    + `<script>`
    + `(function () {`
    + `  var PAGE_H = 984;`
    + `  var h = document.documentElement.scrollHeight;`
    + `  if (h > PAGE_H) { document.body.style.zoom = PAGE_H / h; }`
    + `})();`
    + `</script>`

    + `</body></html>`;
}

function buildPrintEventsTable(events, primary, accent) {
  const rows = events.map(event => renderPrintEventRow(event, primary, accent)).join('');
  return `<table class="evt-table">`
    + `<thead><tr>`
    + `<th class="time-cell" style="border-left:none;">Time</th>`
    + `<th>Event</th>`
    + `<th class="loc-cell">Location</th>`
    + `</tr></thead>`
    + `<tbody>${rows}</tbody>`
    + `</table>`;
}

function renderPrintEventRow(event, primary, accent) {
  if (event.isDeparture) {
    return `<tr style="opacity:0.6;">`
      + `<td class="time-cell" style="border-left-color:#ccc;font-size:10pt;font-weight:bold;color:#aaa;">${formatTime(event.start, event.timezone)}</td>`
      + `<td colspan="2">`
      + `<div style="font-size:10.5pt;color:#888;font-weight:bold;">${event.title}</div>`
      + `<div style="font-size:9pt;color:#aaa;font-style:italic;margin-top:2px;">${event.notes}</div>`
      + `</td>`
      + `</tr>`;
  }

  if (event.allDay) {
    return `<tr style="background:#f9f7f3;">`
      + `<td class="time-cell" style="border-left-color:${accent};font-size:8.5pt;font-weight:bold;color:${accent};text-transform:uppercase;letter-spacing:0.08em;">All Day</td>`
      + `<td style="font-size:12pt;color:${primary};font-weight:bold;">${event.title}</td>`
      + `<td class="loc-cell">${event.location || ''}</td>`
      + `</tr>`;
  }

  const blurb    = event.notes || event.generatedBlurb || '';
  const isFlight = /flight|depart|arrive|airline|airways/i.test(event.title);
  const border   = isFlight ? '#9a7c3a' : accent;

  return `<tr>`
    + `<td class="time-cell" style="border-left-color:${border};">`
    + `<div style="font-size:11pt;font-weight:bold;color:${primary};">${formatTime(event.start, event.timezone)}</div>`
    + `<div style="font-size:9pt;color:#777;">to ${formatTime(event.end, event.timezone)}</div>`
    + `<div style="font-size:8pt;color:#aaa;text-transform:uppercase;margin-top:3px;">${event.calendar}</div>`
    + `</td>`
    + `<td>`
    + `<div style="font-size:12pt;color:${primary};font-weight:bold;margin-bottom:2px;">${event.title}</div>`
    + (blurb ? `<div style="font-size:9.5pt;color:#333;line-height:1.5;margin-top:2px;">${blurb}</div>` : '')
    + `</td>`
    + `<td class="loc-cell">${event.location || ''}</td>`
    + `</tr>`;
}

module.exports = { buildPrintHTML };
