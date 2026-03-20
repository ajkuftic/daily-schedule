'use strict';

const cron = require('node-cron');
const db   = require('./db/index');
const { sendDailyNewsletter } = require('./services/newsletter');

let currentTask = null;

function startScheduler() {
  reschedule();
}

/**
 * (Re-)read the schedule from config and (re-)register the cron task.
 * Call this after the user changes the schedule hour in the setup UI.
 */
function reschedule() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }

  const config   = db.getAllConfig();
  const hour     = parseInt(config.schedule_hour ?? 7, 10);
  const timezone = config.timezone || 'America/New_York';

  if (!config.setup_complete) {
    console.log('[scheduler] Setup not complete — scheduler not started');
    return;
  }

  const expression = `0 ${hour} * * *`;
  console.log(`[scheduler] Scheduling daily send at ${hour}:00 ${timezone} (cron: ${expression})`);

  currentTask = cron.schedule(expression, async () => {
    console.log('[scheduler] Triggered — sending daily newsletter...');
    try {
      const freshConfig = db.getAllConfig();
      await sendDailyNewsletter(freshConfig);
    } catch (err) {
      console.error('[scheduler] Error:', err.message);
      db.logSend(new Date().toISOString().substring(0, 10), 'error', err.message);
    }
  }, { timezone });
}

module.exports = { startScheduler, reschedule };
