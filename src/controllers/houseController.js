// src/controllers/houseController.js
const pool = require('../config/db');
const { uploadMultiple } = require('../services/imageUploadService');

// ========== 1. CREATE HOUSE ==========
exports.createHouse = async (req, res, next) => {
  const landlordId = req.user.id;
  const {
    name, status, type, bedrooms, description, rentPrice, depositAmount,
    locationAddress, latitude, longitude, region, district, division, ward, village, street,
    waterIncluded, electricityIncluded, internetIncluded, nearbyAmenities,
    hasCeiling, hasAluminium, hasCeilingBoard, hasTiles, hasFence,
    layoutType, hasPrivateBathroom, hasPrivateToilet, hasPrivateKitchen,
    isSharedBathroom, isSharedToilet, isSharedKitchen, numberOfSharedUnits,
    imageUrls = [],
    videoUrls = []
  } = req.body;

  // Validate required fields
  if (!name || !rentPrice || !locationAddress) {
    return res.status(400).json({ error: 'Jina, bei na anwani zinahitajika.' });
  }

  try {
    await pool.query('BEGIN');

    // Check if coordinates are valid numbers
    const hasValidCoords = latitude != null && longitude != null && !isNaN(latitude) && !isNaN(longitude);

    // Insert query (simplified to avoid dynamic columns)
    const insertQuery = `
      INSERT INTO houses (
        landlord_id, name, status, type, bedrooms, description,
        rent_price, deposit_amount, location_address, latitude, longitude,
        region, district, division, ward, village, street,
        water_included, electricity_included, internet_included, nearby_amenities,
        has_ceiling, has_aluminium, has_ceiling_board, has_tiles, has_fence,
        layout_type, has_private_bathroom, has_private_toilet, has_private_kitchen,
        is_shared_bathroom, is_shared_toilet, is_shared_kitchen, number_of_shared_units,
        geom
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21,
        $22, $23, $24, $25, $26,
        $27, $28, $29, $30,
        $31, $32, $33, $34,
        ${hasValidCoords ? 'ST_SetSRID(ST_MakePoint($35, $36), 4326)' : 'NULL'}
      )
      RETURNING id
    `;

    const values = [
      landlordId, name, status || 'Inapatikana', type, bedrooms, description,
      rentPrice, depositAmount, locationAddress, latitude, longitude,
      region, district, division, ward, village, street,
      waterIncluded || false, electricityIncluded || false, internetIncluded || false, nearbyAmenities,
      hasCeiling || false, hasAluminium || false, hasCeilingBoard || false, hasTiles || false, hasFence || false,
      layoutType || 'self_container',
      hasPrivateBathroom ?? true, hasPrivateToilet ?? true, hasPrivateKitchen ?? true,
      isSharedBathroom || false, isSharedToilet || false, isSharedKitchen || false,
      numberOfSharedUnits
    ];

    const finalValues = hasValidCoords ? [...values, longitude, latitude] : values;
    const result = await pool.query(insertQuery, finalValues);
    const houseId = result.rows[0].id;

    // Save images
    for (let i = 0; i < imageUrls.length; i++) {
      await pool.query(
        `INSERT INTO house_images (house_id, image_url, display_order) VALUES ($1, $2, $3)`,
        [houseId, imageUrls[i], i]
      );
    }

    // Save videos
    for (let i = 0; i < videoUrls.length; i++) {
      await pool.query(
        `INSERT INTO house_videos (house_id, video_url, display_order) VALUES ($1, $2, $3)`,
        [houseId, videoUrls[i], i]
      );
    }

    await pool.query('COMMIT');
    res.status(201).json({ message: 'Nyumba imeundwa kikamilifu!', houseId });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Create house error:', err);
    next(err);
  }
};

// ========== 2. UPLOAD MEDIA ==========
exports.uploadMedia = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Hakuna faili zilizopakiwa.' });
  }

  try {
    const results = await uploadMultiple(req.files);
    res.status(200).json({ files: results });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ========== 3. GET ALL HOUSES ==========
exports.getAllHouses = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        h.*,
        COALESCE((SELECT array_agg(image_url ORDER BY display_order) FROM house_images WHERE house_id = h.id), '{}') AS images,
        COALESCE((SELECT array_agg(video_url ORDER BY display_order) FROM house_videos WHERE house_id = h.id), '{}') AS videos
      FROM houses h
      WHERE h.status = 'Inapatikana'
      ORDER BY h.created_at DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) { next(err); }
};

// ========== 4. GET HOUSE BY ID ==========
exports.getHouseById = async (req, res, next) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT 
        h.*,
        COALESCE((SELECT array_agg(image_url ORDER BY display_order) FROM house_images WHERE house_id = h.id), '{}') AS images,
        COALESCE((SELECT array_agg(video_url ORDER BY display_order) FROM house_videos WHERE house_id = h.id), '{}') AS videos,
        u.first_name AS landlord_first_name, u.last_name AS landlord_last_name, u.phone AS landlord_phone, u.email AS landlord_email
      FROM houses h
      LEFT JOIN users u ON h.landlord_id = u.id
      WHERE h.id = $1
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Nyumba haikupatikana' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
};

// ========== 5. GET MY HOUSES (Landlord) ==========
exports.getMyHouses = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        h.*,
        COALESCE((SELECT array_agg(image_url ORDER BY display_order) FROM house_images WHERE house_id = h.id), '{}') AS images,
        COALESCE((SELECT array_agg(video_url ORDER BY display_order) FROM house_videos WHERE house_id = h.id), '{}') AS videos
      FROM houses h
      WHERE h.landlord_id = $1
      ORDER BY h.created_at DESC
    `;
    const result = await pool.query(query, [req.user.id]);
    res.json(result.rows);
  } catch (err) { next(err); }
};

// ========== 6. UPDATE HOUSE ==========
exports.updateHouse = async (req, res, next) => {
  const { id } = req.params;
  const landlordId = req.user.id;
  const updates = req.body;
  try {
    const ownerCheck = await pool.query(`SELECT id FROM houses WHERE id = $1 AND landlord_id = $2`, [id, landlordId]);
    if (ownerCheck.rows.length === 0) return res.status(403).json({ error: 'Huna ruhusa' });

    const allowedFields = [
      'name', 'status', 'type', 'bedrooms', 'description', 'rent_price', 'deposit_amount',
      'location_address', 'region', 'district', 'division', 'ward', 'village', 'street',
      'water_included', 'electricity_included', 'internet_included', 'nearby_amenities',
      'has_ceiling', 'has_aluminium', 'has_ceiling_board', 'has_tiles', 'has_fence',
      'layout_type', 'has_private_bathroom', 'has_private_toilet', 'has_private_kitchen',
      'is_shared_bathroom', 'is_shared_toilet', 'is_shared_kitchen', 'number_of_shared_units'
    ];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${idx++}`);
        values.push(updates[field]);
      }
    }
    if (updates.latitude !== undefined && updates.longitude !== undefined) {
      setClauses.push(`geom = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
      values.push(updates.longitude, updates.latitude);
    }
    if (setClauses.length === 0) return res.status(400).json({ error: 'No fields to update' });
    setClauses.push('updated_at = NOW()');
    values.push(id);
    const query = `UPDATE houses SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id`;
    const result = await pool.query(query, values);
    res.json({ message: 'Nyumba imebadilishwa', houseId: result.rows[0].id });
  } catch (err) { next(err); }
};

// ========== 7. DELETE HOUSE ==========
exports.deleteHouse = async (req, res, next) => {
  const { id } = req.params;
  const landlordId = req.user.id;
  try {
    const ownerCheck = await pool.query(`SELECT id FROM houses WHERE id = $1 AND landlord_id = $2`, [id, landlordId]);
    if (ownerCheck.rows.length === 0) return res.status(403).json({ error: 'Huna ruhusa' });
    await pool.query(`DELETE FROM houses WHERE id = $1`, [id]);
    res.json({ message: 'Nyumba imefutwa' });
  } catch (err) { next(err); }
};

// ========== 8. ADD IMAGE ==========
exports.addHouseImage = async (req, res, next) => {
  const { id } = req.params;
  const { imageUrl } = req.body;
  const landlordId = req.user.id;
  try {
    const ownerCheck = await pool.query(`SELECT id FROM houses WHERE id = $1 AND landlord_id = $2`, [id, landlordId]);
    if (ownerCheck.rows.length === 0) return res.status(403).json({ error: 'Huna ruhusa' });
    const order = await pool.query(`SELECT COALESCE(MAX(display_order), -1) + 1 as next FROM house_images WHERE house_id = $1`, [id]);
    const newOrder = order.rows[0].next;
    const result = await pool.query(
      `INSERT INTO house_images (house_id, image_url, display_order) VALUES ($1, $2, $3) RETURNING *`,
      [id, imageUrl, newOrder]
    );
    res.status(201).json({ message: 'Picha imeongezwa', image: result.rows[0] });
  } catch (err) { next(err); }
};

// ========== 9. ADD VIDEO ==========
exports.addHouseVideo = async (req, res, next) => {
  const { id } = req.params;
  const { videoUrl, thumbnailUrl } = req.body;
  const landlordId = req.user.id;
  try {
    const ownerCheck = await pool.query(`SELECT id FROM houses WHERE id = $1 AND landlord_id = $2`, [id, landlordId]);
    if (ownerCheck.rows.length === 0) return res.status(403).json({ error: 'Huna ruhusa' });
    const order = await pool.query(`SELECT COALESCE(MAX(display_order), -1) + 1 as next FROM house_videos WHERE house_id = $1`, [id]);
    const newOrder = order.rows[0].next;
    const result = await pool.query(
      `INSERT INTO house_videos (house_id, video_url, thumbnail_url, display_order) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, videoUrl, thumbnailUrl, newOrder]
    );
    res.status(201).json({ message: 'Video imeongezwa', video: result.rows[0] });
  } catch (err) { next(err); }
};

// ========== 10. DELETE IMAGE ==========
exports.deleteHouseImage = async (req, res, next) => {
  const { imageId } = req.params;
  const landlordId = req.user.id;
  try {
    const image = await pool.query(`SELECT house_id FROM house_images WHERE id = $1`, [imageId]);
    if (image.rows.length === 0) return res.status(404).json({ error: 'Picha haikupatikana' });
    const houseId = image.rows[0].house_id;
    const ownerCheck = await pool.query(`SELECT id FROM houses WHERE id = $1 AND landlord_id = $2`, [houseId, landlordId]);
    if (ownerCheck.rows.length === 0) return res.status(403).json({ error: 'Huna ruhusa' });
    await pool.query(`DELETE FROM house_images WHERE id = $1`, [imageId]);
    res.json({ message: 'Picha imefutwa' });
  } catch (err) { next(err); }
};

// ========== 11. DELETE VIDEO ==========
exports.deleteHouseVideo = async (req, res, next) => {
  const { videoId } = req.params;
  const landlordId = req.user.id;
  try {
    const video = await pool.query(`SELECT house_id FROM house_videos WHERE id = $1`, [videoId]);
    if (video.rows.length === 0) return res.status(404).json({ error: 'Video haikupatikana' });
    const houseId = video.rows[0].house_id;
    const ownerCheck = await pool.query(`SELECT id FROM houses WHERE id = $1 AND landlord_id = $2`, [houseId, landlordId]);
    if (ownerCheck.rows.length === 0) return res.status(403).json({ error: 'Huna ruhusa' });
    await pool.query(`DELETE FROM house_videos WHERE id = $1`, [videoId]);
    res.json({ message: 'Video imefutwa' });
  } catch (err) { next(err); }
};