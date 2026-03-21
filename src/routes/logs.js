'use strict';

const express = require('express');
const db      = require('../db/index');

const router = express.Router();

// GET /logs
router.get('/', (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
  const status = ['success', 'error'].includes(req.query.status) ? req.query.status : null;
  const result = db.getLogs({ page, perPage: 50, status });
  res.render('logs', { ...result, status, flash: req.query });
});

// POST /logs/clear
router.post('/clear', (req, res) => {
  db.clearLogs();
  res.redirect('/logs?cleared=1');
});

module.exports = router;
