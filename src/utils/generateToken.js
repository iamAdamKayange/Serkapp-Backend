const jwt = require('jsonwebtoken');

const generateToken = (user) => {
  // Use shorter expiration for admin security
  const expiresIn = user.role === 'admin' ? '1d' : '7d';
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

module.exports = generateToken;