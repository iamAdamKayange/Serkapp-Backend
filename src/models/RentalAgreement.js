const pool = require('../config/db');

class RentalAgreement {
  constructor(row) {
    this.id = row.id;
    this.houseId = row.house_id;
    this.tenantId = row.tenant_id;
    this.startDate = row.start_date;
    this.endDate = row.end_date;
    this.monthlyRent = parseFloat(row.monthly_rent);
    this.status = row.status;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
    // optional joined fields
    this.houseName = row.house_name;
    this.tenantName = row.tenant_name;
    this.tenantPhone = row.tenant_phone;
  }

  // Create new agreement request
  static async create({ houseId, tenantId, startDate, endDate, monthlyRent }) {
    const result = await pool.query(
      `INSERT INTO rental_agreements (house_id, tenant_id, start_date, end_date, monthly_rent, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [houseId, tenantId, startDate, endDate, monthlyRent]
    );
    return new RentalAgreement(result.rows[0]);
  }

  // Find by ID
  static async findById(id) {
    const result = await pool.query('SELECT * FROM rental_agreements WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return new RentalAgreement(result.rows[0]);
  }

  // Get agreements for a tenant
  static async findByTenant(tenantId) {
    const query = `
      SELECT ra.*, h.name as house_name
      FROM rental_agreements ra
      JOIN houses h ON ra.house_id = h.id
      WHERE ra.tenant_id = $1
      ORDER BY ra.created_at DESC
    `;
    const result = await pool.query(query, [tenantId]);
    return result.rows.map(row => new RentalAgreement(row));
  }

  // Get agreements for a landlord (all houses owned)
  static async findByLandlord(landlordId) {
    const query = `
      SELECT ra.*, h.name as house_name, u.first_name, u.last_name, u.phone as tenant_phone
      FROM rental_agreements ra
      JOIN houses h ON ra.house_id = h.id
      JOIN users u ON ra.tenant_id = u.id
      WHERE h.landlord_id = $1
      ORDER BY ra.created_at DESC
    `;
    const result = await pool.query(query, [landlordId]);
    return result.rows.map(row => new RentalAgreement(row));
  }

  // Update status (landlord action)
  async updateStatus(newStatus) {
    const result = await pool.query(
      `UPDATE rental_agreements SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [newStatus, this.id]
    );
    if (result.rows.length === 0) return null;
    return new RentalAgreement(result.rows[0]);
  }
}

module.exports = RentalAgreement;