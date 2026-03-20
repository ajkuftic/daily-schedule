'use strict';

require('dotenv').config();

const path    = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const setupRoutes = require('./routes/setup');
const authRoutes  = require('./routes/auth');
const apiRoutes   = require('./routes/api');
const { startScheduler } = require('./scheduler');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const PORT     = parseInt(process.env.PORT || '3000', 10);

const app = express();

// ── VIEW ENGINE ───────────────────────────────────────────────
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use(session({
  store:  new SQLiteStore({ dir: DATA_DIR, db: 'sessions.db' }),
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 1 week
}));

// ── ROUTES ────────────────────────────────────────────────────
app.use('/setup', setupRoutes);
app.use('/auth',  authRoutes);
app.use('/api',   apiRoutes);

// Root → dashboard
app.get('/', (req, res) => res.redirect('/setup'));

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Daily Schedule running at http://localhost:${PORT}`);
  startScheduler();
});
