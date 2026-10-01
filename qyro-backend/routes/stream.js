const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { subscribe } = require('../lib/stream');

const router = express.Router();

function bearerFromQuery(req, res, next) {
  if (!req.headers.authorization && typeof req.query.token === 'string') {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}

router.get('/', bearerFromQuery, requireAuth, requireRole('ADMIN', 'AUDITOR'), (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const unsubscribe = subscribe(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
});

module.exports = router;
