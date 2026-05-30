// src/controllers/houseController.js
const pool = require('../config/db');
const { uploadMultiple } = require('../services/imageUploadService');

// ======================
// 1. UPLOAD MEDIA (Picha na Video)
// ======================
/**
 * @route POST /api/houses/upload-media
 * @desc Upload images and videos to Cloudinary
 * @access Private (Landlord/Admin)
 */
exports.uploadMedia = async (req, res, next) => {
  // Hakikisha faili zimepakiwa
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Hakuna faili zilizopakiwa.' });
  }

  try {
    console.log(`📤 Uploading ${req.files.length} file(s)...`);
    const results = await uploadMultiple(req.files);
    console.log('✅ Upload successful:', results.length);
    res.status(200).json({ files: results });
  } catch (error) {
    console.error('❌ Upload error:', error.message);
    // Tuma kosa la kina kwa mteja (kwa development)
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
};

// ======================
// 2. CREATE HOUSE (pamoja na picha na video)
// ======================
/**
 * @route POST /api/houses
 * @desc Create a new house with images and videos
 * @access Private (Landlord only)
 */
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

    // Ingiza nyumba (geom ikiwepo)
    let geomSql = '';
    let geomValues = [];
    if (latitude && longitude) {
      geomSql = `, geom = ST_SetSRID(ST_MakePoint($${geomValues.length + 1}, $${geomValues.length + 2}), 4326)`;
      geomValues = [longitude, latitude];
    }

    const houseQuery = `
      INSERT INTO houses (
        landlord_id, name, status, type, bedrooms, description,
        rent_price, deposit_amount, location_address, latitude, longitude,
        region, district, division, ward, village, street,
        water_included, electricity_included, internet_included, nearby_amenities,
        has_ceiling, has_aluminium, has_ceiling_board, has_tiles, has_fence,
        layout_type, has_private_bathroom, has_private_toilet, has_private_kitchen,
        is_shared_bathroom, is_shared_toilet, is_shared_kitchen, number_of_shared_units
        ${geomSql}
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
        $32, $33, $34, $35, $36
      ) RETURNING id
    `;
    const values = [
      landlordId, name, status || 'Inapatikana', type, bedrooms, description,
      rentPrice, depositAmount, locationAddress, latitude, longitude,
      region, district, division, ward, village, street,
      waterIncluded || false, electricityIncluded || false, internetIncluded || false, nearbyAmenities,
      hasCeiling || false, hasAluminium || false, hasCeilingBoard || false, hasTiles || false, hasFence || false,
      layoutType || 'self_container', hasPrivateBathroom ?? true, hasPrivateToilet ?? true, hasPrivateKitchen ?? true,
      isSharedBathroom || false, isSharedToilet || false, isSharedKitchen || false, numberOfSharedUnits
    ];
    // Add geom values at the end if needed
    const allValues = [...values, ...geomValues];
    const result = await pool.query(houseQuery, allValues);
    const houseId = result.rows[0].id;

    // Ingiza picha
    for (let i = 0; i < imageUrls.length; i++) {
      await pool.query(
        `INSERT INTO house_images (house_id, image_url, display_order) VALUES ($1, $2, $3)`,
        [houseId, imageUrls[i], i]
      );
    }

    // Ingiza video
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

// ======================
// 3. GET ALL HOUSES (with filters + PostGIS)
// ======================
exports.getAllHouses = async (req, res, next) => {
  const { minPrice, maxPrice, type, search, university } = req.query;
  const uniCoords = {
    'UDOM': { lat: -6.1730, lng: 35.7419, radiusKm: 1.5 },
    'UDSM': { lat: -6.7816, lng: 39.2057, radiusKm: 2.0 },
    'MUST': { lat: -8.9094, lng: 33.4608, radiusKm: 1.0 },
    'DIT': { lat: -6.8144, lng: 39.2833, radiusKm: 1.2 },
    'CBE': { lat: -6.1736, lng: 35.7410, radiusKm: 1.5 },
    'SUA': { lat: -6.6999, lng: 36.6936, radiusKm: 1.8 },
    'IFM': { lat: -6.81395, lng: 39.29366, radiusKm: 1.3 },
  };

  try {
    let baseQuery = `
      SELECT 
        h.*,
        COALESCE((SELECT array_agg(image_url ORDER BY display_order) FROM house_images WHERE house_id = h.id), '{}') AS images,
        COALESCE((SELECT array_agg(video_url ORDER BY display_order) FROM house_videos WHERE house_id = h.id), '{}') AS videos
      FROM houses h
      WHERE h.status = 'Inapatikana'
    `;
    const values = [];
    let idx = 1;

    if (minPrice) { baseQuery += ` AND h.rent_price >= $${idx++}`; values.push(minPrice); }
    if (maxPrice) { baseQuery += ` AND h.rent_price <= $${idx++}`; values.push(maxPrice); }
    if (type && type !== 'Zote') { baseQuery += ` AND h.type = $${idx++}`; values.push(type); }
    if (search) {
      baseQuery += ` AND (h.name ILIKE $${idx++} OR h.location_address ILIKE $${idx++} OR h.region ILIKE $${idx++} OR h.ward ILIKE $${idx++})`;
      const pattern = `%${search}%`;
      values.push(pattern, pattern, pattern, pattern);
    }
    if (university && university !== 'Zote' && uniCoords[university]) {
      const uni = uniCoords[university];
      baseQuery += `
        AND h.geom IS NOT NULL
        AND ST_DWithin(h.geom, ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326), $${idx++})
      `;
      values.push(uni.lng, uni.lat, uni.radiusKm * 1000);
    }
    baseQuery += ` ORDER BY h.created_at DESC`;
    const result = await pool.query(baseQuery, values);
    res.json(result.rows);
  } catch (err) { next(err); }
};

// ======================
// 4. GET HOUSE BY ID
// ======================
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

// ======================
// 5. GET MY HOUSES (Landlord)
// ======================
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

// ======================
// 6. UPDATE HOUSE
// ======================
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

// ======================
// 7. DELETE HOUSE
// ======================
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

// ======================
// 8. ADD IMAGE
// ======================
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

// ======================
// 9. ADD VIDEO
// ======================
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

// ======================
// 10. DELETE IMAGE
// ======================
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

// ======================
// 11. DELETE VIDEO
// ======================
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