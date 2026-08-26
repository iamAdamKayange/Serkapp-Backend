const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify token with expiration check
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
    
    // Add additional security checks
    if (!decoded.id || !decoded.email) {
      return res.status(401).json({ error: 'Invalid token structure' });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    console.warn('Token verification failed:', err.message);
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

module.exports = { authMiddleware, landlordOnly, adminOnly, tenantOnly };
