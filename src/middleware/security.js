const rateLimit = require('express-rate-limit');

// Rate limiting for sensitive operations
const sensitiveOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 requests per windowMs
  message: 'Too many attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for authenticated admin users
    return req.user?.role === 'admin';
  }
});

// Rate limiting for password operations
const passwordOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 password operations per hour
  message: 'Too many password attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Validate email to prevent user enumeration
const safeEmailResponse = (req, res, next) => {
  const originalJson = res.json;
  res.json = function(data) {
    // If it's an auth error, use generic message
    if (data.error && (data.error.includes('Email') || data.error.includes('email'))) {
      data.error = 'Invalid credentials';
    }
    return originalJson.call(this, data);
  };
  next();
};

// Security headers for additional protection
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
};

// Validate user is not banned
const checkUserNotBanned = async (req, res, next) => {
  try {
    const pool = require('../config/db');
    const result = await pool.query(
      'SELECT is_banned FROM users WHERE id = $1::uuid',
      [req.user.id]
    );
    
    if (result.rows.length > 0 && result.rows[0].is_banned) {
      return res.status(403).json({ error: 'Account is banned' });
    }
    
    next();
  } catch (error) {
    // If check fails, proceed (don't block on errors)
    next();
  }
};

module.exports = {
  sensitiveOperationLimiter,
  passwordOperationLimiter,
  safeEmailResponse,
  securityHeaders,
  checkUserNotBanned
};