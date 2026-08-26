const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const generateToken = require('../utils/generateToken');

// @route POST /api/auth/register
exports.register = async (req, res, next) => {
  const { email, password, firstName, lastName, phone, role } = req.body;
  try {
    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Validate role
    const validRoles = ['normal', 'landlord', 'admin'];
    const userRole = validRoles.includes(role) ? role : 'normal';
    
    // Insert user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, first_name, last_name, role`,
      [email, passwordHash, firstName, lastName, phone, userRole]
    );
    const user = result.rows[0];
    const token = generateToken(user);
    
    // If registering as landlord, create initial verification records
    if (userRole === 'landlord') {
      await pool.query(
        `INSERT INTO landlord_identity_verification (user_id, full_name, status, created_at)
         VALUES ($1, $2, 'pending', NOW())`,
        [user.id, `${firstName} ${lastName}`]
      );
      
      await pool.query(
        `INSERT INTO landlord_property_verification (user_id, status, created_at)
         VALUES ($1, 'pending', NOW())`,
        [user.id]
      );
    }
    
    res.status(201).json({
      message: 'User registered successfully',
      user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role },
      token,
    });
  } catch (err) {
    next(err);
  }
};

// @route POST /api/auth/login
exports.login = async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, first_name, last_name, phone, role FROM users WHERE email = $1`,
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = generateToken(user);
    res.json({
      message: 'Login successful',
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      role: user.role,
      token,
    });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/auth/me (protected)
exports.getMe = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, phone, role, created_at FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};