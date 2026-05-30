// src/controllers/houseController.js
const pool = require('../config/db');
const House = require('../models/House');
const HouseImage = require('../models/HouseImage');
const HouseVideo = require('../models/HouseVideo');
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
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Hakuna faili zilizopakiwa.' });
  }

  try {
    const results = await uploadMultiple(req.files);
    res.status(200).json({ files: results });
  } catch (error) {
    next(error);
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
    imageUrls = [],   // URLs kutoka upload-media
    videoUrls = []    // URLs kutoka upload-media
  } = req.body;

  try {
    await pool.query('BEGIN');

    // 1. Create house record
    const houseData = {
      landlordId, name, status: status || 'Inapatikana', type, bedrooms, description,
      rentPrice, depositAmount, locationAddress, latitude, longitude,
      region, district, division, ward, village, street,
      waterIncluded: waterIncluded || false,
      electricityIncluded: electricityIncluded || false,
      internetIncluded: internetIncluded || false,
      nearbyAmenities,
      hasCeiling: hasCeiling || false,
      hasAluminium: hasAluminium || false,
      hasCeilingBoard: hasCeilingBoard || false,
      hasTiles: hasTiles || false,
      hasFence: hasFence || false,
      layoutType: layoutType || 'self_container',
      hasPrivateBathroom: hasPrivateBathroom ?? true,
      hasPrivateToilet: hasPrivateToilet ?? true,
      hasPrivateKitchen: hasPrivateKitchen ?? true,
      isSharedBathroom: isSharedBathroom || false,
      isSharedToilet: isSharedToilet || false,
      isSharedKitchen: isSharedKitchen || false,
      numberOfSharedUnits
    };
    const house = await House.create(houseData);

    // 2. Insert image URLs
    for (let i = 0; i < imageUrls.length; i++) {
      await HouseImage.create(house.id, imageUrls[i], i);
    }

    // 3. Insert video URLs
    for (let i = 0; i < videoUrls.length; i++) {
      await HouseVideo.create(house.id, videoUrls[i], null, i);
    }

    await pool.query('COMMIT');
    res.status(201).json({ message: 'Nyumba imeundwa kikamilifu!', houseId: house.id });
  } catch (err) {
    await pool.query('ROLLBACK');
    next(err);
  }
};

// ======================
// 3. GET ALL HOUSES (with filters + PostGIS university proximity)
// ======================
/**
 * @route GET /api/houses
 * @desc Get all available houses with filters and university proximity
 * @access Public
 */
exports.getAllHouses = async (req, res, next) => {
  const { minPrice, maxPrice, type, search, university } = req.query;

  // University coordinates (Tanzania major universities)
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
    // Build base query with images and videos
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

    // Filters
    if (minPrice) {
      baseQuery += ` AND h.rent_price >= $${idx++}`;
      values.push(minPrice);
    }
    if (maxPrice) {
      baseQuery += ` AND h.rent_price <= $${idx++}`;
      values.push(maxPrice);
    }
    if (type && type !== 'Zote') {
      baseQuery += ` AND h.type = $${idx++}`;
      values.push(type);
    }
    if (search) {
      baseQuery += ` AND (h.name ILIKE $${idx++} OR h.location_address ILIKE $${idx++} OR h.region ILIKE $${idx++} OR h.ward ILIKE $${idx++})`;
      const pattern = `%${search}%`;
      values.push(pattern, pattern, pattern, pattern);
    }

    // University proximity (PostGIS)
    if (university && university !== 'Zote' && uniCoords[university]) {
      const uni = uniCoords[university];
      baseQuery += `
        AND h.geom IS NOT NULL
        AND ST_DWithin(
          h.geom,
          ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326),
          $${idx++}
        )
      `;
      values.push(uni.lng, uni.lat, uni.radiusKm * 1000);
    }

    baseQuery += ` ORDER BY h.created_at DESC`;
    const result = await pool.query(baseQuery, values);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// ======================
// 4. GET HOUSE BY ID (with images & videos)
// ======================
/**
 * @route GET /api/houses/:id
 * @desc Get single house details with owner info
 * @access Public
 */
exports.getHouseById = async (req, res, next) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT 
        h.*,
        COALESCE((SELECT array_agg(image_url ORDER BY display_order) FROM house_images WHERE house_id = h.id), '{}') AS images,
        COALESCE((SELECT array_agg(video_url ORDER BY display_order) FROM house_videos WHERE house_id = h.id), '{}') AS videos,
        u.first_name AS landlord_first_name,
        u.last_name AS landlord_last_name,
        u.phone AS landlord_phone,
        u.email AS landlord_email
      FROM houses h
      LEFT JOIN users u ON h.landlord_id = u.id
      WHERE h.id = $1
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nyumba haikupatikana' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

// ======================
// 5. GET MY HOUSES (Landlord)
// ======================
/**
 * @route GET /api/houses/landlord/my-houses
 * @desc Get all houses owned by the logged-in landlord
 * @access Private (Landlord only)
 */
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
  } catch (err) {
    next(err);
  }
};

// ======================
// 6. UPDATE HOUSE
// ======================
/**
 * @route PUT /api/houses/:id
 * @desc Update house details (landlord only)
 * @access Private (Landlord only)
 */
exports.updateHouse = async (req, res, next) => {
  const { id } = req.params;
  const landlordId = req.user.id;
  const updates = req.body;

  try {
    // Verify ownership
    const house = await House.findById(id);
    if (!house || house.landlordId !== landlordId) {
      return res.status(403).json({ error: 'Huna ruhusa ya kubadilisha nyumba hii' });
    }

    // Update house fields (excluding images/videos - handle separately)
    const updatedHouse = await house.update(updates);
    res.json({ message: 'Nyumba imebadilishwa kikamilifu', houseId: updatedHouse.id });
  } catch (err) {
    next(err);
  }
};

// ======================
// 7. DELETE HOUSE
// ======================
/**
 * @route DELETE /api/houses/:id
 * @desc Delete house and all associated images/videos (landlord only)
 * @access Private (Landlord only)
 */
exports.deleteHouse = async (req, res, next) => {
  const { id } = req.params;
  const landlordId = req.user.id;

  try {
    const house = await House.findById(id);
    if (!house || house.landlordId !== landlordId) {
      return res.status(403).json({ error: 'Huna ruhusa ya kufuta nyumba hii' });
    }
    await house.delete();
    res.json({ message: 'Nyumba imefutwa kikamilifu' });
  } catch (err) {
    next(err);
  }
};

// ======================
// 8. ADD IMAGE TO HOUSE
// ======================
/**
 * @route POST /api/houses/:id/images
 * @desc Add a new image to existing house
 * @access Private (Landlord only)
 */
exports.addHouseImage = async (req, res, next) => {
  const { id } = req.params;
  const { imageUrl } = req.body;
  const landlordId = req.user.id;

  try {
    const house = await House.findById(id);
    if (!house || house.landlordId !== landlordId) {
      return res.status(403).json({ error: 'Huna ruhusa' });
    }
    const newImage = await HouseImage.create(id, imageUrl);
    res.status(201).json({ message: 'Picha imeongezwa', image: newImage });
  } catch (err) {
    next(err);
  }
};

// ======================
// 9. ADD VIDEO TO HOUSE
// ======================
/**
 * @route POST /api/houses/:id/videos
 * @desc Add a new video to existing house
 * @access Private (Landlord only)
 */
exports.addHouseVideo = async (req, res, next) => {
  const { id } = req.params;
  const { videoUrl, thumbnailUrl } = req.body;
  const landlordId = req.user.id;

  try {
    const house = await House.findById(id);
    if (!house || house.landlordId !== landlordId) {
      return res.status(403).json({ error: 'Huna ruhusa' });
    }
    const newVideo = await HouseVideo.create(id, videoUrl, thumbnailUrl);
    res.status(201).json({ message: 'Video imeongezwa', video: newVideo });
  } catch (err) {
    next(err);
  }
};

// ======================
// 10. DELETE IMAGE FROM HOUSE
// ======================
/**
 * @route DELETE /api/houses/images/:imageId
 * @desc Delete an image
 * @access Private (Landlord only)
 */
exports.deleteHouseImage = async (req, res, next) => {
  const { imageId } = req.params;
  const landlordId = req.user.id;

  try {
    // First get the house_id from the image
    const imageResult = await pool.query(`SELECT house_id FROM house_images WHERE id = $1`, [imageId]);
    if (imageResult.rows.length === 0) return res.status(404).json({ error: 'Picha haikupatikana' });
    const houseId = imageResult.rows[0].house_id;

    const house = await House.findById(houseId);
    if (!house || house.landlordId !== landlordId) {
      return res.status(403).json({ error: 'Huna ruhusa' });
    }
    await pool.query(`DELETE FROM house_images WHERE id = $1`, [imageId]);
    res.json({ message: 'Picha imefutwa' });
  } catch (err) {
    next(err);
  }
};

// ======================
// 11. DELETE VIDEO FROM HOUSE
// ======================
/**
 * @route DELETE /api/houses/videos/:videoId
 * @desc Delete a video
 * @access Private (Landlord only)
 */
exports.deleteHouseVideo = async (req, res, next) => {
  const { videoId } = req.params;
  const landlordId = req.user.id;

  try {
    const videoResult = await pool.query(`SELECT house_id FROM house_videos WHERE id = $1`, [videoId]);
    if (videoResult.rows.length === 0) return res.status(404).json({ error: 'Video haikupatikana' });
    const houseId = videoResult.rows[0].house_id;

    const house = await House.findById(houseId);
    if (!house || house.landlordId !== landlordId) {
      return res.status(403).json({ error: 'Huna ruhusa' });
    }
    await pool.query(`DELETE FROM house_videos WHERE id = $1`, [videoId]);
    res.json({ message: 'Video imefutwa' });
  } catch (err) {
    next(err);
  }
};