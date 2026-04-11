'use strict';

require('dotenv').config();
require('./logger'); // patch console early so all modules are captured

const path    = require('path');
const express = require('express');
const session          = require('express-session');
const BetterSqliteStore = require('./db/session-store');

const setupRoutes   = require('./routes/setup');
const authRoutes    = require('./routes/auth');
const apiRoutes     = require('./routes/api');
const webhookRoutes = require('./routes/webhook');
const logsRoutes    = require('./routes/logs');
const requireAuth   = require('./middleware/requireAuth');
const { startScheduler } = require('./scheduler');
const db            = require('./db/index');

const fs = require('fs');

const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, '../data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PORT        = parseInt(process.env.PORT || '3000', 10);

// Ensure uploads directory exists
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();

// ── VIEW ENGINE ───────────────────────────────────────────────
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use(session({
  store:  new BetterSqliteStore(require('./db/index').db),
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 1 week
}));

// ── ROUTES ────────────────────────────────────────────────────
app.use('/auth',    authRoutes);           // login/logout before auth guard
app.get('/login',  (req, res) => {
  const qs = Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '';
  res.redirect(`/auth/login${qs}`);
});

app.use(requireAuth);                      // everything below requires login

// Expose branding colors to all views
app.use((req, res, next) => {
  res.locals.branding = {
    primary: db.getConfig('branding_primary_color') || '#1a2e4a',
    accent:  db.getConfig('branding_accent_color')  || '#c9a96e',
  };
  next();
});

// Serve uploaded logos (authenticated)
app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/setup',   setupRoutes);
app.use('/api',     apiRoutes);
app.use('/logs',    logsRoutes);
app.use('/webhook', webhookRoutes);

// Root → dashboard
app.get('/', (req, res) => res.redirect('/setup'));

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Daily Schedule running at http://localhost:${PORT}`);
  startScheduler();
});
