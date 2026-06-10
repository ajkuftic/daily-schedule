'use strict';

const express = require('express');
const db      = require('../db/index');
const router  = express.Router();

// GET /setup/recipients
router.get('/recipients', (req, res) => {
  const recipients = db.getRecipients();
  res.render('setup-recipients', { recipients, flash: req.query });
});

// POST /setup/recipients/add
router.post('/recipients/add', (req, res) => {
  try {
    const { email, name, include_pdf } = req.body;
    if (!email) throw new Error('Email is required');
    db.addRecipient(email.trim(), (name || '').trim() || null, include_pdf === '1');
    res.redirect('/setup/recipients?saved=1');
  } catch (err) {
    res.redirect('/setup/recipients?error=' + encodeURIComponent(err.message));
  }
});

// POST /setup/recipients/update-all  — bulk save from the single-form table
router.post('/recipients/update-all', (req, res) => {
  try {
    const ids     = [].concat(req.body.ids     || []);
    const emails  = req.body.email       || {};
    const names   = req.body.name        || {};
    const pdfs    = req.body.include_pdf || {};
    const actives = req.body.active      || {};

    for (const id of ids) {
      const email = (emails[id] || '').trim();
      if (!email) continue;
      db.updateRecipient(parseInt(id, 10), {
        email,
        name:        (names[id] || '').trim() || null,
        include_pdf: pdfs[id] === '1',
        active:      actives[id] === '1',
      });
    }
    res.redirect('/setup/recipients?saved=1');
  } catch (err) {
    res.redirect('/setup/recipients?error=' + encodeURIComponent(err.message));
  }
});

// POST /setup/recipients/:id/delete
router.post('/recipients/:id/delete', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.deleteRecipient(id);
    res.redirect('/setup/recipients?deleted=1');
  } catch (err) {
    res.redirect('/setup/recipients?error=' + encodeURIComponent(err.message));
  }
});

module.exports = router;
