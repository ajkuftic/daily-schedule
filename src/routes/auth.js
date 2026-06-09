'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db/index');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// ── LOGIN / LOGOUT / PASSWORD ──────────────────────────────────

router.get('/set-password', (req, res) => {
  const config = db.getAllConfig();
  // If a password is already set, only an authenticated user may change it
  if (config.admin_password_hash && !(req.session && req.session.authenticated)) {
    return res.redirect('/login');
  }
  const isFirstRun = !config.admin_password_hash;
  res.render('auth-set-password', { isFirstRun, flash: req.query });
});

router.post('/set-password', async (req, res) => {
  try {
    const config = db.getAllConfig();
    if (config.admin_password_hash && !(req.session && req.session.authenticated)) {
      return res.redirect('/login');
    }
    const { password, confirm } = req.body;
    if (!password || password.length < 12) throw new Error('Password must be at least 12 characters');
    if (!/[A-Z]/.test(password)) throw new Error('Password must contain at least one uppercase letter');
    if (!/[0-9]/.test(password)) throw new Error('Password must contain at least one number');
    if (!/[^a-zA-Z0-9]/.test(password)) throw new Error('Password must contain at least one symbol');
    if (password !== confirm) throw new Error('Passwords do not match');
    const hash = await bcrypt.hash(password, 12);
    db.setConfig('admin_password_hash', hash);
    req.session.authenticated = true;
    res.redirect('/setup');
  } catch (err) {
    const msg = encodeURIComponent(err.message);
    res.redirect(`/auth/set-password?error=${msg}`);
  }
});

router.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect(req.query.return_to || '/setup');
  res.render('auth-login', { flash: req.query });
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { password, return_to } = req.body;
    const config = db.getAllConfig();
    if (!config.admin_password_hash) return res.redirect('/auth/set-password');
    const valid = await bcrypt.compare(password || '', config.admin_password_hash);
    if (!valid) {
      return res.redirect('/login?error=' + encodeURIComponent('Incorrect password'));
    }
    req.session.authenticated = true;
    res.redirect(return_to || '/setup');
  } catch (err) {
    res.redirect('/login?error=' + encodeURIComponent('Login failed'));
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
