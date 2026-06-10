'use strict';

require('dotenv').config();
require('./logger'); // patch console early so all modules are captured

const path    = require('path');
const express = require('express');
const session          = require('express-session');
const BetterSqliteStore = require('./db/session-store');
const { csrfMiddleware } = require('./middleware/csrf');

const setupRoutes      = require('./routes/setup');
const authRoutes       = require('./routes/auth');
const apiRoutes        = require('./routes/api');
const webhookRoutes    = require('./routes/webhook');
const logsRoutes       = require('./routes/logs');
const newslettersRoutes = require('./routes/newsletters');
const recipientsRoutes = require('./routes/recipients');
const requireAuth      = require('./middleware/requireAuth');
const { startScheduler } = require('./scheduler');
const db               = require('./db/index');

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

const isProduction = process.env.NODE_ENV === 'production';

// ── STARTUP VALIDATION ────────────────────────────────────────
if (isProduction) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret === 'change-me') {
    console.error('FATAL: SESSION_SECRET must be set to a strong random value in production. Refusing to start.');
    process.exit(1);
  }
}

// Trust reverse-proxy headers (X-Forwarded-Proto, etc.) so req.secure is correct
app.set('trust proxy', 1);

app.use(session({
  store:  new BetterSqliteStore(require('./db/index').db),
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: true,  // must be true so CSRF-only sessions are persisted on GET
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000, // 1 week
    httpOnly: true,
    sameSite: 'lax',
    secure:   isProduction ? 'auto' : false, // 'auto' honours X-Forwarded-Proto via trust proxy
  },
}));

// CSRF token generation + validation (must come after session)
app.use(csrfMiddleware);

// ── ROUTES ────────────────────────────────────────────────────
app.use('/auth',    authRoutes);           // login/logout before auth guard
app.get('/login',  (req, res) => {
  const qs = Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '';
  res.redirect(`/auth/login${qs}`);
});

// Health check (public — before requireAuth)
app.get('/health', (req, res) => {
  try {
    db.db.prepare('SELECT 1').get();
    res.json({ ok: true, db: true, uptime: Math.floor(process.uptime()), version: require('../package.json').version });
  } catch (err) {
    res.status(503).json({ ok: false, db: false, error: err.message });
  }
});

app.use(requireAuth);                      // everything below requires login

// Expose branding colors and CSRF token to all views
app.use((req, res, next) => {
  res.locals.branding = {
    primary: db.getConfig('branding_primary_color') || '#1a2e4a',
    accent:  db.getConfig('branding_accent_color')  || '#c9a96e',
  };
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
  next();
});

// Serve uploaded logos (authenticated)
app.use('/uploads', express.static(UPLOADS_DIR));

// HSTS — instruct browsers to always use HTTPS
if (isProduction) {
  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    next();
  });
}

app.use('/setup',       setupRoutes);
app.use('/setup',       recipientsRoutes);
app.use('/api',         apiRoutes);
app.use('/logs',        logsRoutes);
app.use('/newsletters', newslettersRoutes);
app.use('/webhook',     webhookRoutes);

// Root → dashboard
app.get('/', (req, res) => res.redirect('/setup'));

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Daily Schedule running at http://localhost:${PORT}`);
  startScheduler();
});
