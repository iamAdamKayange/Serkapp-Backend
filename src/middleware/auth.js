const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add additional security checks
    if (!decoded.id || !decoded.email) {
      return res.status(401).json({ error: 'Invalid token structure' });
    }
    
    // Check if user is banned
    try {
      const banCheck = await pool.query(
        'SELECT is_banned FROM users WHERE id = $1::uuid',
        [decoded.id]
      );
      
      if (banCheck.rows.length > 0 && banCheck.rows[0].is_banned) {
        return res.status(403).json({ error: 'Account is banned' });
      }
    } catch (dbError) {
      // If database check fails, proceed (don't block on errors)
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

const landlordOnly = (req, res, next) => {
  if (req.user?.role !== 'landlord' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Landlord only' });
  }
  next();
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin only' });
  }
  next();
};

const tenantOnly = (req, res, next) => {
  if (req.user?.role !== 'normal' && req.user?.role !== 'tenant') {
    return res.status(403).json({ error: 'Access denied: Tenant only' });
  }
  next();
};

const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin only' });
  }
  next();
};

module.exports = { authMiddleware, landlordOnly, adminOnly, tenantOnly, adminMiddleware };
