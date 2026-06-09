'use strict';

const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfMiddleware(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    // Webhook route authenticates via URL secret — skip CSRF
    if (req.path.startsWith('/webhook/')) return next();

    const contentType = req.headers['content-type'] || '';
    // Multipart forms can't include the token before multer runs; routes validate manually
    if (contentType.startsWith('multipart/form-data')) return next();

    const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
    if (!token || token !== req.session.csrfToken) {
      return res.status(403).send('Forbidden: invalid CSRF token');
    }
  }

  next();
}

// Call this in multipart route handlers after multer has populated req.body
function validateCsrf(req, res) {
  const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    res.status(403).send('Forbidden: invalid CSRF token');
    return false;
  }
  return true;
}

module.exports = { csrfMiddleware, validateCsrf };
