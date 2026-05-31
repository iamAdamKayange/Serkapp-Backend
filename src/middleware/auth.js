const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('🔐 Authorization header:', authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ No token or invalid format');
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  console.log('🔑 Token received (first 20 chars):', token.substring(0, 20) + '...');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Decoded token:', decoded);
    req.user = decoded;
    next();
  } catch (err) {
    console.log('❌ Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const landlordOnly = (req, res, next) => {
  console.log('👤 User role from token:', req.user?.role);
  if (req.user?.role !== 'landlord' && req.user?.role !== 'admin') {
    console.log('❌ Access denied: role is', req.user?.role);
    return res.status(403).json({ error: 'Access denied: Landlord only' });
  }
  console.log('✅ Landlord access granted');
  next();
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    console.log('❌ Admin access denied');
    return res.status(403).json({ error: 'Access denied: Admin only' });
  }
  console.log('✅ Admin access granted');
  next();
};

module.exports = { authMiddleware, landlordOnly, adminOnly };