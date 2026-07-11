const pool = require('../config/db');
const { uploadMultiple, deleteFromSpaces, uploadToSpaces } = require('../services/imageUploadService');
const { emitToAll, emitToLandlord } = require('../services/socketService');
const { createHouseCreatedNotification } = require('../services/notificationService');

// ========== 1. CREATE HOUSE ==========
exports.createHouse = async (req, res, next) => {
  const landlordId = req.user.id;
  const {
    firstName, lastName, name, phone,
    status, type, bedrooms, description,
    rentPrice, depositAmount,
    locationAddress, latitude, longitude,
    region, district, division, ward, village, street,
    waterIncluded, electricityIncluded, internetIncluded, nearbyAmenities,
    hasCeiling, hasAluminium, hasCeilingBoard, hasTiles, hasFence,
    layoutType, hasPrivateBathroom, hasPrivateToilet, hasPrivateKitchen,
    isSharedBathroom, isSharedToilet, isSharedKitchen, numberOfSharedUnits,
    imageUrls = [], videoUrls = [], videoThumbnails = []
  } = req.body;

  if (!firstName || !rentPrice || !locationAddress) {
    return res.status(400).json({ error: 'Jina maarufu, bei na anwani zinahitajika.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasValidCoords = latitude != null && longitude != null && !isNaN(latitude) && !isNaN(longitude);

    const insertQuery = `
      INSERT INTO houses (
        landlord_id,
        brand_name, owner_name, house_number, phone,
        status, type, bedrooms, description,
        rent_price, deposit_amount, location_address,
        region, district, division, ward, village, street,
        water_included, electricity_included, internet_included, nearby_amenities,
        has_ceiling, has_aluminium, has_ceiling_board, has_tiles, has_fence,
        layout_type, has_private_bathroom, has_private_toilet, has_private_kitchen,
        is_shared_bathroom, is_shared_toilet, is_shared_kitchen, number_of_shared_units,
        geom
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25, $26, $27,
        $28, $29, $30, $31,
        $32, $33, $34, $35,
        ${hasValidCoords ? 'ST_SetSRID(ST_MakePoint($36, $37), 4326)' : 'NULL'}
      )
      RETURNING id
    `;

    const baseValues = [
      landlordId,
      firstName, name, lastName, phone,
      status || 'Inapatikana', type, bedrooms, description,
      rentPrice, depositAmount, locationAddress,
      region, district, division, ward, village, street,
      waterIncluded ?? false, electricityIncluded ?? false, internetIncluded ?? false, nearbyAmenities,
      hasCeiling ?? false, hasAluminium ?? false, hasCeilingBoard ?? false, hasTiles ?? false, hasFence ?? false,
      layoutType || 'self_container',
      hasPrivateBathroom ?? true, hasPrivateToilet ?? true, hasPrivateKitchen ?? true,
      isSharedBathroom ?? false, isSharedToilet ?? false, isSharedKitchen ?? false,
      numberOfSharedUnits
    ];

    const finalValues = hasValidCoords ? [...baseValues, longitude, latitude] : baseValues;
    const result = await client.query(insertQuery, finalValues);
    const houseId = result.rows[0].id;

    // Save images
    for (let i = 0; i < imageUrls.length; i++) {
      await client.query(
        `INSERT INTO house_images (house_id, image_url, display_order) VALUES ($1, $2, $3)`,
        [houseId, imageUrls[i], i]
      );
    }
    // Save videos
    for (let i = 0; i < videoUrls.length; i++) {
      await client.query(
        `INSERT INTO house_videos (house_id, video_url, display_order) VALUES ($1, $2, $3)`,
        [houseId, videoUrls[i], i]
      );
    }
    // Save video thumbnails
    for (let i = 0; i < videoThumbnails.length; i++) {
      await client.query(
        `INSERT INTO house_video_thumbnails (house_id, thumbnail_url, display_order) VALUES ($1, $2, $3)`,
        [houseId, videoThumbnails[i], i]
      );
    }

    await client.query('COMMIT');
    emitToAll('house:created', { houseId, landlordId });
    emitToLandlord(landlordId, 'landlord:house_changed', {
      action: 'created',
      houseId,
      landlordId,
    });
    createHouseCreatedNotification({
      houseId,
      landlordId,
      houseName: firstName || name,
      location: locationAddress,
      rentPrice,
      region,
      district,
      houseType: type,
    }).catch((error) => {
      console.error('Create house notification error:', error);
    });
    res.status(201).json({ message: 'Nyumba imeundwa kikamilifu!', houseId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create house error:', err);
    next(err);
  } finally {
    client.release();
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

// ========== 2.5 UPLOAD THUMBNAIL (NEW) ==========
exports.uploadThumbnail = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Hakuna faili iliyopakiwa.' });
  }
  try {
    const result = await uploadToSpaces(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    res.status(200).json({ url: result.url });
  } catch (error) {
    console.error('Thumbnail upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ========== 3. GET ALL HOUSES (with aggregated media) ==========
exports.getAllHouses = async (req, res, next) => {
  try {
    const query = `
      WITH video_like_counts AS (
        SELECT video_id::text AS video_key, COUNT(*)::int AS likes_count
        FROM video_likes
        GROUP BY video_id::text
      ),
      video_comment_counts AS (
        SELECT video_id::text AS video_key, COUNT(*)::int AS comments_count
        FROM video_comments
        GROUP BY video_id::text
      )
      SELECT 
        h.id, h.landlord_id,
        h.brand_name, h.owner_name, h.house_number, h.phone,
        h.status, h.type, h.bedrooms, h.description,
        h.rent_price, h.deposit_amount, h.location_address,
        h.region, h.district, h.division, h.ward, h.village, h.street,
        h.water_included, h.electricity_included, h.internet_included, h.nearby_amenities,
        h.has_ceiling, h.has_aluminium, h.has_ceiling_board, h.has_tiles, h.has_fence,
        h.layout_type, h.has_private_bathroom, h.has_private_toilet, h.has_private_kitchen,
        h.is_shared_bathroom, h.is_shared_toilet, h.is_shared_kitchen, h.number_of_shared_units,
        h.created_at, h.updated_at,
        ST_Y(h.geom) AS latitude,
        ST_X(h.geom) AS longitude,
        COALESCE(
          json_agg(DISTINCT hi.image_url) FILTER (WHERE hi.image_url IS NOT NULL),
          '[]'
        ) AS images,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', hv.id,
            'url', hv.video_url,
            'likes_count', COALESCE(vl.likes_count, 0),
            'comments_count', COALESCE(vc.comments_count, 0)
          )) FILTER (WHERE hv.video_url IS NOT NULL),
          '[]'
        ) AS videos,
        COALESCE(
          json_agg(DISTINCT hvt.thumbnail_url) FILTER (WHERE hvt.thumbnail_url IS NOT NULL),
          '[]'
        ) AS video_thumbnails
      FROM houses h
      LEFT JOIN house_images hi ON hi.house_id = h.id
      LEFT JOIN house_videos hv ON hv.house_id = h.id
      LEFT JOIN house_video_thumbnails hvt ON hvt.house_id = h.id
      LEFT JOIN video_like_counts vl ON vl.video_key = hv.id::text
      LEFT JOIN video_comment_counts vc ON vc.video_key = hv.id::text
      WHERE h.status = 'Inapatikana'
      GROUP BY h.id
      ORDER BY h.created_at DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) { 
    console.error('getAllHouses error:', err);
    next(err); 
  }
};

// ========== 3.5 GET VIDEO FEED (NEW - lightweight) ==========
exports.getVideoFeed = async (req, res, next) => {
  try {
    const query = `
      WITH video_like_counts AS (
        SELECT video_id::text AS video_key, COUNT(*)::int AS likes_count
        FROM video_likes
        GROUP BY video_id::text
      ),
      video_comment_counts AS (
        SELECT video_id::text AS video_key, COUNT(*)::int AS comments_count
        FROM video_comments
        GROUP BY video_id::text
      )
      SELECT 
        h.id,
        h.brand_name,
        h.rent_price,
        h.location_address,
        h.region,
        h.district,
        h.ward,
        h.street,
        ST_Y(h.geom) AS latitude,
        ST_X(h.geom) AS longitude,
        COALESCE(
          json_agg(DISTINCT hv.video_url) FILTER (WHERE hv.video_url IS NOT NULL),
          '[]'
        ) AS videos,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'url', hv.video_url,
            'likes_count', COALESCE(vl.likes_count, 0),
            'comments_count', COALESCE(vc.comments_count, 0)
          )) FILTER (WHERE hv.video_url IS NOT NULL),
          '[]'
        ) AS video_stats,
        COALESCE(
          json_agg(DISTINCT hvt.thumbnail_url) FILTER (WHERE hvt.thumbnail_url IS NOT NULL),
          '[]'
        ) AS video_thumbnails
      FROM houses h
      LEFT JOIN house_videos hv ON hv.house_id = h.id
      LEFT JOIN house_video_thumbnails hvt ON hvt.house_id = h.id
      LEFT JOIN video_like_counts vl ON vl.video_key = hv.id::text
      LEFT JOIN video_comment_counts vc ON vc.video_key = hv.id::text
      WHERE h.status = 'Inapatikana'
      GROUP BY h.id
      ORDER BY h.created_at DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) { 
    console.error('getVideoFeed error:', err);
    next(err); 
  }
};

// ========== 4. GET HOUSE BY ID ==========
exports.getHouseById = async (req, res, next) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT 
        h.id, h.landlord_id,
        h.brand_name, h.owner_name, h.house_number, h.phone,
        h.status, h.type, h.bedrooms, h.description,
        h.rent_price, h.deposit_amount, h.location_address,
        h.region, h.district, h.division, h.ward, h.village, h.street,
        h.water_included, h.electricity_included, h.internet_included, h.nearby_amenities,
        h.has_ceiling, h.has_aluminium, h.has_ceiling_board, h.has_tiles, h.has_fence,
        h.layout_type, h.has_private_bathroom, h.has_private_toilet, h.has_private_kitchen,
        h.is_shared_bathroom, h.is_shared_toilet, h.is_shared_kitchen, h.number_of_shared_units,
        h.created_at, h.updated_at,
        ST_Y(h.geom) AS latitude,
        ST_X(h.geom) AS longitude,
        COALESCE(
          json_agg(DISTINCT hi.image_url) FILTER (WHERE hi.image_url IS NOT NULL),
          '[]'
        ) AS images,
        COALESCE(
          json_agg(DISTINCT hv.video_url) FILTER (WHERE hv.video_url IS NOT NULL),
          '[]'
        ) AS videos,
        COALESCE(
          json_agg(DISTINCT hvt.thumbnail_url) FILTER (WHERE hvt.thumbnail_url IS NOT NULL),
          '[]'
        ) AS video_thumbnails
      FROM houses h
      LEFT JOIN house_images hi ON hi.house_id = h.id
      LEFT JOIN house_videos hv ON hv.house_id = h.id
      LEFT JOIN house_video_thumbnails hvt ON hvt.house_id = h.id
      WHERE h.id = $1
      GROUP BY h.id
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Nyumba haikupatikana' });
    res.json(result.rows[0]);
  } catch (err) { 
    console.error('getHouseById error:', err);
    next(err); 
  }
};

// ========== 5. GET MY HOUSES (Landlord) ==========
exports.getMyHouses = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        h.id, h.landlord_id,
        h.brand_name, h.owner_name, h.house_number, h.phone,
        h.status, h.type, h.bedrooms, h.description,
        h.rent_price, h.deposit_amount, h.location_address,
        h.region, h.district, h.division, h.ward, h.village, h.street,
        h.water_included, h.electricity_included, h.internet_included, h.nearby_amenities,
        h.has_ceiling, h.has_aluminium, h.has_ceiling_board, h.has_tiles, h.has_fence,
        h.layout_type, h.has_private_bathroom, h.has_private_toilet, h.has_private_kitchen,
        h.is_shared_bathroom, h.is_shared_toilet, h.is_shared_kitchen, h.number_of_shared_units,
        h.created_at, h.updated_at,
        ST_Y(h.geom) AS latitude,
        ST_X(h.geom) AS longitude,
        COALESCE(
          json_agg(DISTINCT hi.image_url) FILTER (WHERE hi.image_url IS NOT NULL),
          '[]'
        ) AS images,
        COALESCE(
          json_agg(DISTINCT hv.video_url) FILTER (WHERE hv.video_url IS NOT NULL),
          '[]'
        ) AS videos,
        COALESCE(
          json_agg(DISTINCT hvt.thumbnail_url) FILTER (WHERE hvt.thumbnail_url IS NOT NULL),
          '[]'
        ) AS video_thumbnails
      FROM houses h
      LEFT JOIN house_images hi ON hi.house_id = h.id
      LEFT JOIN house_videos hv ON hv.house_id = h.id
      LEFT JOIN house_video_thumbnails hvt ON hvt.house_id = h.id
      WHERE h.landlord_id = $1
      GROUP BY h.id
      ORDER BY h.created_at DESC
    `;
    const result = await pool.query(query, [req.user.id]);
    res.json(result.rows);
  } catch (err) { 
    console.error('getMyHouses error:', err);
    next(err); 
  }
};

// ========== 6. UPDATE HOUSE ==========
exports.updateHouse = async (req, res, next) => {
  const { id } = req.params;
  const landlordId = req.user.id;
  const updates = req.body;
  try {
    const ownerCheck = await pool.query(`SELECT id FROM houses WHERE id = $1 AND landlord_id = $2`, [id, landlordId]);
    if (ownerCheck.rows.length === 0) return res.status(403).json({ error: 'Huna ruhusa' });

    const fieldMap = {
      firstName: 'brand_name',
      lastName: 'house_number',
      name: 'owner_name',
      phone: 'phone',
      status: 'status',
      type: 'type',
      bedrooms: 'bedrooms',
      description: 'description',
      rentPrice: 'rent_price',
      depositAmount: 'deposit_amount',
      locationAddress: 'location_address',
      region: 'region',
      district: 'district',
      division: 'division',
      ward: 'ward',
      village: 'village',
      street: 'street',
      waterIncluded: 'water_included',
      electricityIncluded: 'electricity_included',
      internetIncluded: 'internet_included',
      nearbyAmenities: 'nearby_amenities',
      hasCeiling: 'has_ceiling',
      hasAluminium: 'has_aluminium',
      hasCeilingBoard: 'has_ceiling_board',
      hasTiles: 'has_tiles',
      hasFence: 'has_fence',
      layoutType: 'layout_type',
      hasPrivateBathroom: 'has_private_bathroom',
      hasPrivateToilet: 'has_private_toilet',
      hasPrivateKitchen: 'has_private_kitchen',
      isSharedBathroom: 'is_shared_bathroom',
      isSharedToilet: 'is_shared_toilet',
      isSharedKitchen: 'is_shared_kitchen',
      numberOfSharedUnits: 'number_of_shared_units'
    };

    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const [frontField, dbField] of Object.entries(fieldMap)) {
      if (updates[frontField] !== undefined) {
        setClauses.push(`${dbField} = $${idx++}`);
        values.push(updates[frontField]);
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
    emitToAll('house:updated', { houseId: result.rows[0].id, landlordId });
    emitToLandlord(landlordId, 'landlord:house_changed', {
      action: 'updated',
      houseId: result.rows[0].id,
      landlordId,
    });
    res.json({ message: 'Nyumba imebadilishwa', houseId: result.rows[0].id });
  } catch (err) { 
    console.error('updateHouse error:', err);
    next(err); 
  }
};

// ========== 7. DELETE HOUSE ==========
exports.deleteHouse = async (req, res, next) => {
  const { id } = req.params;
  const landlordId = req.user.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const ownerCheck = await client.query(`SELECT id FROM houses WHERE id = $1 AND landlord_id = $2`, [id, landlordId]);
    if (ownerCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Huna ruhusa' });
    }

    const images = await client.query(`SELECT image_url FROM house_images WHERE house_id = $1`, [id]);
    const videos = await client.query(`SELECT video_url FROM house_videos WHERE house_id = $1`, [id]);
    const thumbnails = await client.query(`SELECT thumbnail_url FROM house_video_thumbnails WHERE house_id = $1`, [id]);

    for (const img of images.rows) await deleteFromSpaces(img.image_url);
    for (const vid of videos.rows) await deleteFromSpaces(vid.video_url);
    for (const thumb of thumbnails.rows) await deleteFromSpaces(thumb.thumbnail_url);

    await client.query(`DELETE FROM houses WHERE id = $1`, [id]);
    await client.query('COMMIT');
    emitToAll('house:deleted', { houseId: id, landlordId });
    emitToLandlord(landlordId, 'landlord:house_changed', {
      action: 'deleted',
      houseId: id,
      landlordId,
    });
    res.json({ message: 'Nyumba imefutwa pamoja na faili zake zote DigitalOcean Spaces.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('deleteHouse error:', err);
    next(err);
  } finally {
    client.release();
  }
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
    emitToAll('house:media_updated', { houseId: id, mediaType: 'image', action: 'added', landlordId });
    emitToLandlord(landlordId, 'landlord:house_changed', {
      action: 'media_updated',
      houseId: id,
      mediaType: 'image',
      landlordId,
    });
    res.status(201).json({ message: 'Picha imeongezwa', image: result.rows[0] });
  } catch (err) { 
    console.error('addHouseImage error:', err);
    next(err); 
  }
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
      `INSERT INTO house_videos (house_id, video_url, display_order) VALUES ($1, $2, $3) RETURNING *`,
      [id, videoUrl, newOrder]
    );
    if (thumbnailUrl) {
      await pool.query(
        `INSERT INTO house_video_thumbnails (house_id, thumbnail_url, display_order) VALUES ($1, $2, $3)`,
        [id, thumbnailUrl, newOrder]
      );
    }
    emitToAll('house:media_updated', { houseId: id, mediaType: 'video', action: 'added', landlordId });
    emitToAll('video:feed_updated', { houseId: id, action: 'added' });
    emitToLandlord(landlordId, 'landlord:house_changed', {
      action: 'media_updated',
      houseId: id,
      mediaType: 'video',
      landlordId,
    });
    res.status(201).json({ message: 'Video imeongezwa', video: result.rows[0] });
  } catch (err) { 
    console.error('addHouseVideo error:', err);
    next(err); 
  }
};

// ========== 10. DELETE IMAGE ==========
exports.deleteHouseImage = async (req, res, next) => {
  const { imageId } = req.params;
  const landlordId = req.user.id;
  try {
    const image = await pool.query(`SELECT house_id, image_url FROM house_images WHERE id = $1`, [imageId]);
    if (image.rows.length === 0) return res.status(404).json({ error: 'Picha haikupatikana' });
    const houseId = image.rows[0].house_id;
    const ownerCheck = await pool.query(`SELECT id FROM houses WHERE id = $1 AND landlord_id = $2`, [houseId, landlordId]);
    if (ownerCheck.rows.length === 0) return res.status(403).json({ error: 'Huna ruhusa' });
    await deleteFromSpaces(image.rows[0].image_url);
    await pool.query(`DELETE FROM house_images WHERE id = $1`, [imageId]);
    emitToAll('house:media_updated', { houseId, mediaType: 'image', action: 'deleted', landlordId });
    emitToLandlord(landlordId, 'landlord:house_changed', {
      action: 'media_updated',
      houseId,
      mediaType: 'image',
      landlordId,
    });
    res.json({ message: 'Picha imefutwa kwenye database na DigitalOcean Spaces.' });
  } catch (err) { 
    console.error('deleteHouseImage error:', err);
    next(err); 
  }
};

// ========== 11. DELETE VIDEO ==========
exports.deleteHouseVideo = async (req, res, next) => {
  const { videoId } = req.params;
  const landlordId = req.user.id;
  try {
    const video = await pool.query(`SELECT house_id, video_url FROM house_videos WHERE id = $1`, [videoId]);
    if (video.rows.length === 0) return res.status(404).json({ error: 'Video haikupatikana' });
    const houseId = video.rows[0].house_id;
    const ownerCheck = await pool.query(`SELECT id FROM houses WHERE id = $1 AND landlord_id = $2`, [houseId, landlordId]);
    if (ownerCheck.rows.length === 0) return res.status(403).json({ error: 'Huna ruhusa' });
    await deleteFromSpaces(video.rows[0].video_url);
    await pool.query(`DELETE FROM house_video_thumbnails WHERE house_id = $1 AND display_order = (SELECT display_order FROM house_videos WHERE id = $2)`, [houseId, videoId]);
    await pool.query(`DELETE FROM house_videos WHERE id = $1`, [videoId]);
    emitToAll('house:media_updated', { houseId, mediaType: 'video', action: 'deleted', landlordId });
    emitToAll('video:feed_updated', { houseId, videoId, action: 'deleted' });
    emitToLandlord(landlordId, 'landlord:house_changed', {
      action: 'media_updated',
      houseId,
      mediaType: 'video',
      landlordId,
    });
    res.json({ message: 'Video imefutwa kwenye database na DigitalOcean Spaces.' });
  } catch (err) { 
    console.error('deleteHouseVideo error:', err);
    next(err); 
  }
};
