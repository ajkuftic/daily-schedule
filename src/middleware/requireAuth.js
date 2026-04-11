'use strict';

const db = require('../db/index');

// Paths that never require authentication
const PUBLIC_PATHS = ['/login', '/auth/set-password'];

module.exports = function requireAuth(req, res, next) {
  // Incoming webhooks authenticate via their secret in the URL — skip auth
  if (req.path.startsWith('/webhook/')) return next();

  // Public pages
  if (PUBLIC_PATHS.some(p => req.path === p || req.path.startsWith(p + '?'))) return next();

  const config = db.getAllConfig();

  // First run: no password set yet — send to setup
  if (!config.admin_password_hash) {
    return res.redirect('/auth/set-password');
  }

  // Dev preview bypass — never set this in production
  if (process.env.DEV_AUTOLOGIN === '1') return next();

  // Authenticated
  if (req.session && req.session.authenticated) return next();

  // Not logged in
  const returnTo = req.originalUrl !== '/login' ? `?return_to=${encodeURIComponent(req.originalUrl)}` : '';
  return res.redirect(`/login${returnTo}`);
};
