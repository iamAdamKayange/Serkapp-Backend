const pool = require('../config/db');
const bcrypt = require('bcryptjs');

class User {
  constructor(row) {
    this.id = row.id;
    this.email = row.email;
    this.passwordHash = row.password_hash;
    this.firstName = row.first_name;
    this.lastName = row.last_name;
    this.phone = row.phone;
    this.role = row.role;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  // Find user by email
  static async findByEmail(email) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return null;
    return new User(result.rows[0]);
  }

  // Find user by ID
  static async findById(id) {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return new User(result.rows[0]);
  }

  // Create new user
  static async create({ email, password, firstName, lastName, phone, role = 'normal' }) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [email, passwordHash, firstName, lastName, phone, role]
    );
    return new User(result.rows[0]);
  }

  // Verify password
  async verifyPassword(plainPassword) {
    return bcrypt.compare(plainPassword, this.passwordHash);
  }

  // Update user (partial)
  async update(updates) {
    const allowed = ['first_name', 'last_name', 'phone'];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const field of allowed) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${idx++}`);
        values.push(updates[field]);
      }
    }
    if (setClauses.length === 0) return this;
    setClauses.push('updated_at = NOW()');
    values.push(this.id);
    const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);
    return new User(result.rows[0]);
  }

  // Delete user (optional)
  async delete() {
    await pool.query('DELETE FROM users WHERE id = $1', [this.id]);
  }
}

module.exports = User;