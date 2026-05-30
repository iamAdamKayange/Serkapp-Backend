const pool = require('../config/db');

class Payment {
  constructor(row) {
    this.id = row.id;
    this.agreementId = row.agreement_id;
    this.houseId = row.house_id;
    this.userId = row.user_id;
    this.amount = parseFloat(row.amount);
    this.paymentMethod = row.payment_method;
    this.transactionId = row.transaction_id;
    this.status = row.status;
    this.paidAt = row.paid_at;
    this.metadata = row.metadata;
    this.createdAt = row.created_at;
  }

  // Create new payment record
  static async create({ userId, agreementId, houseId, amount, paymentMethod = 'M-Pesa', transactionId = null }) {
    const result = await pool.query(
      `INSERT INTO payments (user_id, agreement_id, house_id, amount, payment_method, transaction_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [userId, agreementId || null, houseId || null, amount, paymentMethod, transactionId]
    );
    return new Payment(result.rows[0]);
  }

  // Find by transaction ID (M-Pesa)
  static async findByTransactionId(transactionId) {
    const result = await pool.query('SELECT * FROM payments WHERE transaction_id = $1', [transactionId]);
    if (result.rows.length === 0) return null;
    return new Payment(result.rows[0]);
  }

  // Update payment status
  async updateStatus(status, paidAt = null) {
    const result = await pool.query(
      `UPDATE payments SET status = $1, paid_at = COALESCE($2, paid_at), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, paidAt, this.id]
    );
    if (result.rows.length === 0) return null;
    return new Payment(result.rows[0]);
  }

  // Update transaction ID (after M-Pesa initiation)
  async setTransactionId(transactionId) {
    const result = await pool.query(
      `UPDATE payments SET transaction_id = $1 WHERE id = $2 RETURNING *`,
      [transactionId, this.id]
    );
    return new Payment(result.rows[0]);
  }
}

module.exports = Payment;