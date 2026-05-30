const pool = require('../config/db');

// @route POST /api/agreements (tenant requests to rent)
exports.createAgreement = async (req, res, next) => {
  const { houseId, startDate, endDate, monthlyRent } = req.body;
  const tenantId = req.user.id;
  try {
    // Check if house exists and is available
    const houseCheck = await pool.query(`SELECT id, status FROM houses WHERE id = $1`, [houseId]);
    if (houseCheck.rows.length === 0) return res.status(404).json({ error: 'House not found' });
    if (houseCheck.rows[0].status !== 'Inapatikana') return res.status(400).json({ error: 'House not available' });
    
    const result = await pool.query(
      `INSERT INTO rental_agreements (house_id, tenant_id, start_date, end_date, monthly_rent, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      [houseId, tenantId, startDate, endDate, monthlyRent]
    );
    res.status(201).json({ agreementId: result.rows[0].id, message: 'Request sent to landlord' });
  } catch (err) { next(err); }
};

// @route GET /api/agreements/tenant (requests made by logged-in tenant)
exports.getMyRequests = async (req, res, next) => {
  const tenantId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT ra.*, h.name as house_name, h.location_address 
       FROM rental_agreements ra
       JOIN houses h ON ra.house_id = h.id
       WHERE ra.tenant_id = $1
       ORDER BY ra.created_at DESC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
};

// @route GET /api/agreements/landlord (requests for landlord's houses)
exports.getLandlordRequests = async (req, res, next) => {
  const landlordId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT ra.*, h.name as house_name, u.first_name, u.last_name, u.phone as tenant_phone
       FROM rental_agreements ra
       JOIN houses h ON ra.house_id = h.id
       JOIN users u ON ra.tenant_id = u.id
       WHERE h.landlord_id = $1
       ORDER BY ra.created_at DESC`,
      [landlordId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
};

// @route PUT /api/agreements/:id/status (landlord approves/rejects)
exports.updateAgreementStatus = async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved', 'cancelled'
  const landlordId = req.user.id;
  try {
    // Verify ownership
    const check = await pool.query(
      `SELECT ra.id FROM rental_agreements ra
       JOIN houses h ON ra.house_id = h.id
       WHERE ra.id = $1 AND h.landlord_id = $2`,
      [id, landlordId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: 'Not authorized' });
    
    await pool.query(`UPDATE rental_agreements SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id]);
    if (status === 'approved') {
      // Change house status to 'Imekodishwa'
      await pool.query(
        `UPDATE houses SET status = 'Imekodishwa' WHERE id = (SELECT house_id FROM rental_agreements WHERE id = $1)`,
        [id]
      );
    }
    res.json({ message: `Agreement ${status}` });
  } catch (err) { next(err); }
};