// src/controllers/houseController.js
const pool = require('../config/db');
const { uploadMultiple } = require('../services/imageUploadService');
const cloudinary = require('cloudinary').v2;

// Helper: extract public_id from Cloudinary URL
const extractPublicIdFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split('/');
  const versionPart = parts.find(part => part.startsWith('v'));
  const versionIndex = parts.indexOf(versionPart);
  if (versionIndex !== -1 && parts.length > versionIndex + 1) {
    const filename = parts[versionIndex + 1];
    const publicId = filename.substring(0, filename.lastIndexOf('.'));
    const folderParts = parts.slice(versionIndex + 2, -1);
    return folderParts.length ? `${folderParts.join('/')}/${publicId}` : publicId;
  }
  return null;
};

// Helper: delete from Cloudinary by URL
const deleteFromCloudinary = async (url) => {
  const publicId = extractPublicIdFromUrl(url);
  if (!publicId) return;
  try {
    const resourceType = url.includes('/video/upload/') ? 'video' : 'image';
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    console.log(`Deleted from Cloudinary: ${publicId} (${resourceType})`);
  } catch (err) {
    console.error(`Failed to delete ${url}:`, err.message);
  }
};

// ========== 1. CREATE HOUSE ==========
exports.createHouse = async (req, res, next) => {
  const landlordId = req.user.id;
  const {
    firstName,          // brand_name
    lastName,           // house_number
    name,               // owner_name
    phone,
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

  try {
    await pool.query('BEGIN');

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
    // Save video thumbnails
    for (let i = 0; i < videoThumbnails.length; i++) {
      await pool.query(
        `INSERT INTO house_video_thumbnails (house_id, thumbnail_url, display_order) VALUES ($1, $2, $3)`,
        [houseId, videoThumbnails[i], i]
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

// Helper: build house object from DB row
const buildHouseObject = async (row) => {
  // Fetch images
  const imagesRes = await pool.query(
    `SELECT image_url FROM house_images WHERE house_id = $1 ORDER BY display_order`,
    [row.id]
  );
  const images = imagesRes.rows.map(r => r.image_url);
  // Fetch videos
  const videosRes = await pool.query(
    `SELECT video_url FROM house_videos WHERE house_id = $1 ORDER BY display_order`,
    [row.id]
  );
  const videos = videosRes.rows.map(r => r.video_url);
  // Fetch thumbnails
  const thumbsRes = await pool.query(
    `SELECT thumbnail_url FROM house_video_thumbnails WHERE house_id = $1 ORDER BY display_order`,
    [row.id]
  );
  const videoThumbnails = thumbsRes.rows.map(r => r.thumbnail_url);

  return {
    id: row.id.toString(),
    name: row.owner_name,                 // jina la mwenye nyumba
    firstName: row.brand_name,            // jina maarufu
    lastName: row.house_number,           // namba ya nyumba
    phone: row.phone,
    status: row.status,
    type: row.type,
    bedrooms: row.bedrooms,
    description: row.description,
    rentPrice: parseFloat(row.rent_price),
    depositAmount: row.deposit_amount ? parseFloat(row.deposit_amount) : null,
    location: row.location_address,
    address: row.location_address,
    latitude: row.latitude ? parseFloat(row.latitude) : null,
    longitude: row.longitude ? parseFloat(row.longitude) : null,
    region: row.region,
    district: row.district,
    division: row.division,
    ward: row.ward,
    village: row.village,
    street: row.street,
    images: images,
    videos: videos,
    videoThumbnails: videoThumbnails,
    waterIncluded: row.water_included,
    electricityIncluded: row.electricity_included,
    internetIncluded: row.internet_included,
    nearbyAmenities: row.nearby_amenities,
    hasCeiling: row.has_ceiling,
    hasAluminium: row.has_aluminium,
    hasCeilingBoard: row.has_ceiling_board,
    hasTiles: row.has_tiles,
    hasFence: row.has_fence,
    layoutType: row.layout_type,
    hasPrivateBathroom: row.has_private_bathroom,
    hasPrivateToilet: row.has_private_toilet,
    hasPrivateKitchen: row.has_private_kitchen,
    isSharedBathroom: row.is_shared_bathroom,
    isSharedToilet: row.is_shared_toilet,
    isSharedKitchen: row.is_shared_kitchen,
    numberOfSharedUnits: row.number_of_shared_units,
    createdAt: row.created_at
  };
};

// ========== 3. GET ALL HOUSES ==========
exports.getAllHouses = async (req, res, next) => {
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
        ST_X(h.geom) AS longitude
      FROM houses h
      WHERE h.status = 'Inapatikana'
      ORDER BY h.created_at DESC
    `;
    const result = await pool.query(query);
    const houses = [];
    for (const row of result.rows) {
      houses.push(await buildHouseObject(row));
    }
    res.json(houses);
  } catch (err) { next(err); }
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
        ST_X(h.geom) AS longitude
      FROM houses h
      WHERE h.id = $1
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Nyumba haikupatikana' });
    const house = await buildHouseObject(result.rows[0]);
    res.json(house);
  } catch (err) { next(err); }
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
        ST_X(h.geom) AS longitude
      FROM houses h
      WHERE h.landlord_id = $1
      ORDER BY h.created_at DESC
    `;
    const result = await pool.query(query, [req.user.id]);
    const houses = [];
    for (const row of result.rows) {
      houses.push(await buildHouseObject(row));
    }
    res.json(houses);
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

    // Map frontend fields to DB columns
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
    // Update geometry if latitude & longitude provided
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

// ========== 7. DELETE HOUSE (with Cloudinary cleanup) ==========
exports.deleteHouse = async (req, res, next) => {
  const { id } = req.params;
  const landlordId = req.user.id;
  try {
    const ownerCheck = await pool.query(`SELECT id FROM houses WHERE id = $1 AND landlord_id = $2`, [id, landlordId]);
    if (ownerCheck.rows.length === 0) return res.status(403).json({ error: 'Huna ruhusa' });

    // Fetch all media URLs
    const images = await pool.query(`SELECT image_url FROM house_images WHERE house_id = $1`, [id]);
    const videos = await pool.query(`SELECT video_url FROM house_videos WHERE house_id = $1`, [id]);
    const thumbnails = await pool.query(`SELECT thumbnail_url FROM house_video_thumbnails WHERE house_id = $1`, [id]);

    // Delete from Cloudinary
    for (const img of images.rows) await deleteFromCloudinary(img.image_url);
    for (const vid of videos.rows) await deleteFromCloudinary(vid.video_url);
    for (const thumb of thumbnails.rows) await deleteFromCloudinary(thumb.thumbnail_url);

    // Delete house (cascade will remove media records)
    await pool.query(`DELETE FROM houses WHERE id = $1`, [id]);
    res.json({ message: 'Nyumba imefutwa pamoja na faili zake zote Cloudinary.' });
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
      `INSERT INTO house_videos (house_id, video_url, display_order) VALUES ($1, $2, $3) RETURNING *`,
      [id, videoUrl, newOrder]
    );
    // If thumbnail provided, insert into thumbnails table
    if (thumbnailUrl) {
      await pool.query(
        `INSERT INTO house_video_thumbnails (house_id, thumbnail_url, display_order) VALUES ($1, $2, $3)`,
        [id, thumbnailUrl, newOrder]
      );
    }
    res.status(201).json({ message: 'Video imeongezwa', video: result.rows[0] });
  } catch (err) { next(err); }
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
    await deleteFromCloudinary(image.rows[0].image_url);
    await pool.query(`DELETE FROM house_images WHERE id = $1`, [imageId]);
    res.json({ message: 'Picha imefutwa kwenye database na Cloudinary.' });
  } catch (err) { next(err); }
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
    await deleteFromCloudinary(video.rows[0].video_url);
    // Also delete associated thumbnails
    await pool.query(`DELETE FROM house_video_thumbnails WHERE house_id = $1 AND display_order = (SELECT display_order FROM house_videos WHERE id = $2)`, [houseId, videoId]);
    await pool.query(`DELETE FROM house_videos WHERE id = $1`, [videoId]);
    res.json({ message: 'Video imefutwa kwenye database na Cloudinary.' });
  } catch (err) { next(err); }
};