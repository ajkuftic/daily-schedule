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
    // rid is a hidden field inside <td> — one per row, reliably submitted.
    // [].concat handles both a single string and an array of strings.
    const ids = [].concat(req.body.rid || []);
    for (const id of ids) {
      const email = (req.body[`email_${id}`] || '').trim();
      if (!email) continue;
      db.updateRecipient(parseInt(id, 10), {
        email,
        name:        (req.body[`name_${id}`] || '').trim() || null,
        include_pdf: req.body[`include_pdf_${id}`] === '1',
        active:      req.body[`active_${id}`] === '1',
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
