'use strict';

const express           = require('express');
const db                = require('../db/index');
const { readLogTail }   = require('../logger');

const router = express.Router();

// GET /logs  — tabbed: send history + app logs
router.get('/', (req, res) => {
  const tab    = req.query.tab === 'app' ? 'app' : 'sends';
  const page   = Math.max(1, parseInt(req.query.page || '1', 10));
  const status = ['success', 'error'].includes(req.query.status) ? req.query.status : null;

  const sends  = tab === 'sends' ? db.getLogs({ page, perPage: 50, status }) : null;
  const appLog = tab === 'app'   ? readLogTail(500) : null;

  res.render('logs', { tab, sends, appLog, status, flash: req.query });
});

// POST /logs/clear-sends
router.post('/clear-sends', (req, res) => {
  db.clearLogs();
  res.redirect('/logs?tab=sends&cleared=1');
});

module.exports = router;
