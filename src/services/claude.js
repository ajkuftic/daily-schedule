'use strict';

const Anthropic = require('@anthropic-ai/sdk');

async function enrichEventsWithBlurbs(events, city, dateStr, apiKey) {
  if (!apiKey) {
    console.log('[blurb] No API key — skipping blurbs');
    return;
  }

  const client = new Anthropic({ apiKey });
  const timedEvents = events.filter(e => !e.allDay);

  let baseLocation = city;
  for (const e of events) {
    if (e.allDay && e.location) { baseLocation = e.location; break; }
  }

  for (let i = 0; i < timedEvents.length; i++) {
    const event = timedEvents[i];

    if (event.notes?.trim()) continue;

    const isGenericLogistics = /^(breakfast|lunch|dinner|sleep|wake up|pack|unpack|laundry)$/i.test(event.title.trim());
    if (isGenericLogistics && !event.location) continue;

    try {
      const timeStr = formatTime(event.start, event.timezone) + ' \u2013 ' + formatTime(event.end, event.timezone);
      const locationContext = event.location ? `Location: ${event.location}` : `City context: ${city}`;

      const prevLocation = (i > 0 && timedEvents[i - 1].location) ? timedEvents[i - 1].location : baseLocation;
      const travelContext = (event.location && prevLocation && event.location !== prevLocation)
        ? `\nPrevious location: ${prevLocation}` : '';

      const prompt = `You are writing content for a family daily itinerary newsletter. `
        + `For this event, write two things separated by the exact string '---TRAVEL---':\n\n`
        + `1. A 1-2 sentence blurb about the event itself. Friendly and warm, specific and helpful. `
        + `Do NOT start with the event name. Do NOT use quotes. Under 40 words.\n\n`
        + `2. ONLY if the previous location and current location are different and both are known: `
        + `a single short travel duration — JUST the time estimate, nothing else. `
        + `Examples: 'About 20 minutes', 'Allow 30 minutes', 'About 45 min by metro'. `
        + `If no meaningful travel info applies, leave part 2 completely empty.\n\n`
        + `Format your response as exactly:\n`
        + `[blurb text]---TRAVEL---[duration only, or blank]\n\n`
        + `Event: ${event.title}\n`
        + `${locationContext}\n`
        + `Time: ${timeStr}\n`
        + `Date: ${dateStr}`
        + travelContext;

      const message = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages:   [{ role: 'user', content: prompt }],
      }, { timeout: 20_000 });

      const raw = message.content[0]?.text?.trim() || '';
      const parts = raw.split('---TRAVEL---');
      event.generatedBlurb = parts[0].trim();

      const duration = (parts[1] || '').trim();
      if (duration) {
        event.travelDuration     = duration;
        event.travelFromLocation = prevLocation;
      }
    } catch (err) {
      console.error(`[blurb] Error for "${event.title}":`, err.message);
    }
  }
}

function formatTime(date, tz) {
  return new Intl.DateTimeFormat('en-US', {
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true,
    timeZone: tz || 'America/New_York',
  }).format(new Date(date));
}

module.exports = { enrichEventsWithBlurbs };
