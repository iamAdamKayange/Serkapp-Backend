const pool = require('../config/db');

// Get dashboard stats
exports.getDashboardStats = async (req, res, next) => {
  try {
    const [usersCount, housesCount, verificationsCount, activeListings] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM users'),
      pool.query('SELECT COUNT(*) as count FROM houses'),
      pool.query('SELECT COUNT(*) as count FROM landlord_identity_verification WHERE status = $1', ['pending']),
      pool.query('SELECT COUNT(*) as count FROM houses WHERE status = $1', ['active']),
    ]);

    res.json({
      totalUsers: parseInt(usersCount.rows[0].count),
      totalHouses: parseInt(housesCount.rows[0].count),
      pendingVerifications: parseInt(verificationsCount.rows[0].count),
      activeListings: parseInt(activeListings.rows[0].count),
    });
  } catch (err) {
    next(err);
  }
};

// Get KPI data
exports.getKPIData = async (req, res, next) => {
  try {
    const [newUsers, newHouses, approvedVerifications, revenue] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM users WHERE created_at >= NOW() - INTERVAL '30 days'"),
      pool.query("SELECT COUNT(*) as count FROM houses WHERE created_at >= NOW() - INTERVAL '30 days'"),
      pool.query("SELECT COUNT(*) as count FROM landlord_identity_verification WHERE status = $1 AND reviewed_at >= NOW() - INTERVAL '30 days'", ['verified']),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE created_at >= NOW() - INTERVAL '30 days'"),
    ]);

    res.json({
      newUsers: parseInt(newUsers.rows[0].count),
      newHouses: parseInt(newHouses.rows[0].count),
      approvedVerifications: parseInt(approvedVerifications.rows[0].count),
      revenue: parseFloat(revenue.rows[0].total),
    });
  } catch (err) {
    next(err);
  }
};

// Get user growth data
exports.getUserGrowth = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `);

    res.json(result.rows.map(row => ({
      month: row.month,
      count: parseInt(row.count),
    })));
  } catch (err) {
    next(err);
  }
};

// Get revenue trends
exports.getRevenueTrends = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `);

    res.json(result.rows.map(row => ({
      month: row.month,
      amount: parseFloat(row.total),
    })));
  } catch (err) {
    next(err);
  }
};

// Get verification stats
exports.getVerificationStats = async (req, res, next) => {
  try {
    const [verified, pending, rejected] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM landlord_identity_verification WHERE status = $1", ['verified']),
      pool.query("SELECT COUNT(*) as count FROM landlord_identity_verification WHERE status = $1", ['pending']),
      pool.query("SELECT COUNT(*) as count FROM landlord_identity_verification WHERE status = $1", ['rejected']),
    ]);

    res.json({
      verified: parseInt(verified.rows[0].count),
      pending: parseInt(pending.rows[0].count),
      rejected: parseInt(rejected.rows[0].count),
    });
  } catch (err) {
    next(err);
  }
};

// Get recent activity
exports.getRecentActivity = async (req, res, next) => {
  try {
    const [recentUsers, recentHouses, recentVerifications] = await Promise.all([
      pool.query(`
        SELECT id, email, first_name, last_name, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT id, title, created_at
        FROM houses
        ORDER BY created_at DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT liv.id, liv.status, liv.submitted_at, u.email
        FROM landlord_identity_verification liv
        JOIN users u ON liv.user_id = u.id
        ORDER BY liv.submitted_at DESC
        LIMIT 5
      `),
    ]);

    res.json({
      users: recentUsers.rows,
      houses: recentHouses.rows,
      verifications: recentVerifications.rows,
    });
  } catch (err) {
    next(err);
  }
};

// Get all users
exports.getUsers = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, email, first_name, last_name, phone, role, created_at
      FROM users
      ORDER BY created_at DESC
    `);

    res.json(result.rows.map(user => ({
      id: user.id,
      name: `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
      role: user.role,
      status: 'active', // Default status since we don't have a status field
      createdAt: user.created_at,
    })));
  } catch (err) {
    next(err);
  }
};

// Get all houses
exports.getHouses = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT h.id, h.title, h.price, h.bedrooms, h.bathrooms, h.location, h.status, h.created_at,
             u.first_name, u.last_name, u.email
      FROM houses h
      JOIN users u ON h.landlord_id = u.id
      ORDER BY h.created_at DESC
    `);

    res.json(result.rows.map(house => ({
      id: house.id,
      title: house.title,
      landlord: `${house.first_name} ${house.last_name}`.trim(),
      landlordEmail: house.email,
      location: house.location,
      price: parseFloat(house.price),
      bedrooms: house.bedrooms,
      bathrooms: house.bathrooms,
      status: house.status || 'active',
      listedAt: house.created_at,
      type: 'apartment', // Default type since we might not have this field
    })));
  } catch (err) {
    next(err);
  }
};

// Get notifications
exports.getNotifications = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, title, message, type, created_at, is_read
      FROM notifications
      WHERE user_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 20
    `, [req.user.id]);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// Get admin profile
exports.getAdminProfile = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, email, first_name, last_name, phone, role
      FROM users
      WHERE id = $1::uuid
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};
