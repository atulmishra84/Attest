const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { hashApiKey } = require('../lib/apiKeys');

const JWT_SECRET = process.env.JWT_SECRET || 'qyro-dev-secret-change-in-production';

function requireHttps(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  if (proto === 'https') return next();
  return res.status(403).json({ error: 'HTTPS required' });
}

/**
 * Middleware: Verify JWT token from Authorization header.
 * Attaches decoded user payload to req.user.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
    try {
      const record = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, email: true, name: true, role: true, deletedAt: true },
      });
      if (!record || record.deletedAt) {
        return res.status(403).json({ error: 'Forbidden: Account is not active' });
      }
      req.user = { id: record.id, email: record.email, name: record.name, role: record.role };
      next();
    } catch (lookupErr) {
      next(lookupErr);
    }
  });
}

/**
 * Middleware: Restrict access to specific roles.
 * Usage: requireRole('ADMIN') or requireRole('ADMIN', 'AUDITOR')
 */
function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Requires one of roles [${allowed.join(', ')}]`,
      });
    }
    next();
  };
}

/**
 * Middleware: Validate a stored API key for machine-to-machine routes.
 * The raw key is never stored. Lookup uses a SHA-256 hash.
 */
async function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized: X-API-Key header required' });
  }

  try {
    const record = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(apiKey) } });
    const expired = record?.expiresAt && record.expiresAt < new Date();
    if (!record || record.deletedAt || expired) {
      return res.status(403).json({ error: 'Forbidden: Invalid API Key' });
    }

    req.apiKey = { id: record.id, name: record.name, role: record.role };
    prisma.apiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth, requireRole, requireApiKey, requireHttps, JWT_SECRET };
