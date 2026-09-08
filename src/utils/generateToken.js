const jwt = require('jsonwebtoken');

const generateToken = (user) => {
  // Use shorter expiration for admin security
  const expiresIn = user.role === 'admin' ? '4h' : '24h';
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      iat: Math.floor(Date.now() / 1000) // Issued at time
    },
    process.env.JWT_SECRET,
    { 
      expiresIn,
      algorithm: 'HS256'
    }
  );
};

module.exports = generateToken;