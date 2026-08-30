// Get verification queue
exports.getVerificationQueue = async (req, res, next) => {
  try {
    const identityVerifications = await pool.query(`
      SELECT 
        liv.id,
        liv.user_id,
        liv.status,
        liv.submitted_at,
        liv.reviewed_at,
        liv.nin_number,
        liv.id_photo_url,
        liv.selfie_photo_url,
        liv.id_document_url,
        u.email,
        u.first_name,
        u.last_name,
        u.phone
      FROM landlord_identity_verification liv
      JOIN users u ON liv.user_id = u.id
      WHERE liv.status = 'pending'
      ORDER BY liv.submitted_at ASC
      LIMIT 20
    `);

    res.json(identityVerifications.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      full_name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      nin_number: row.nin_number,
      id_photo_url: row.id_photo_url,
      selfie_photo_url: row.selfie_photo_url,
      id_document_url: row.id_document_url,
      status: row.status,
      submitted_at: row.submitted_at,
      reviewed_at: row.reviewed_at,
      email: row.email,
      phone: row.phone,
    })));
  } catch (err) {
    console.error('Error in getVerificationQueue:', err);
    res.json([]);
  }
};
