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

// POST /setup/recipients/:id/update
router.post('/recipients/:id/update', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { email, name, include_pdf, active } = req.body;
    if (!email) throw new Error('Email is required');
    db.updateRecipient(id, {
      email:       email.trim(),
      name:        (name || '').trim() || null,
      include_pdf: include_pdf === '1',
      active:      active === '1',
    });
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
