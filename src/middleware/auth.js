const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('Auth middleware called');
  console.log('Auth header:', authHeader ? 'Present' : 'Missing');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('No valid Bearer token found');
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  console.log('Token extracted:', token.substring(0, 20) + '...');

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    console.log('Token decoded successfully:', { id: decoded.id, email: decoded.email, role: decoded.role });
    
    // Add additional security checks
    if (!decoded.id || !decoded.email) {
      console.log('Invalid token structure');
      return res.status(401).json({ error: 'Invalid token structure' });
    }
    
    req.user = decoded;
    console.log('User set in req:', req.user);
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

const adminMiddleware = (req, res, next) => {
  console.log('Admin middleware check:', { 
    userRole: req.user?.role, 
    userExists: !!req.user,
    userId: req.user?.id 
  });
  
  if (req.user?.role !== 'admin') {
    console.log('Admin access denied - role:', req.user?.role);
    return res.status(403).json({ error: 'Access denied: Admin only' });
  }
  console.log('Admin access granted');
  next();
};

module.exports = { authMiddleware, landlordOnly, adminOnly, tenantOnly, adminMiddleware };
