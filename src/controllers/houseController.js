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

  if (!name || !rentPrice || !locationAddress) {
    return res.status(400).json({ error: 'Jina, bei na anwani zinahitajika.' });
  }

  try {
    await pool.query('BEGIN');

    // ======================
    // BUILD GEOM SAFELY
    // ======================
    const hasGeom = latitude && longitude;

    const houseQuery = `
      INSERT INTO houses (
        landlord_id, name, status, type, bedrooms, description,
        rent_price, deposit_amount, location_address, latitude, longitude,
        region, district, division, ward, village, street,
        water_included, electricity_included, internet_included, nearby_amenities,
        has_ceiling, has_aluminium, has_ceiling_board, has_tiles, has_fence,
        layout_type, has_private_bathroom, has_private_toilet, has_private_kitchen,
        is_shared_bathroom, is_shared_toilet, is_shared_kitchen, number_of_shared_units
        ${hasGeom ? ', geom' : ''}
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21,
        $22, $23, $24, $25, $26,
        $27, $28, $29, $30,
        $31, $32, $33, $34
        ${hasGeom ? `, ST_SetSRID(ST_MakePoint($35, $36), 4326)` : ''}
      )
      RETURNING id
    `;

    const values = [
      landlordId,
      name,
      status || 'Inapatikana',
      type,
      bedrooms,
      description,
      rentPrice,
      depositAmount,
      locationAddress,
      latitude,
      longitude,
      region,
      district,
      division,
      ward,
      village,
      street,
      waterIncluded || false,
      electricityIncluded || false,
      internetIncluded || false,
      nearbyAmenities,
      hasCeiling || false,
      hasAluminium || false,
      hasCeilingBoard || false,
      hasTiles || false,
      hasFence || false,
      layoutType || 'self_container',
      hasPrivateBathroom ?? true,
      hasPrivateToilet ?? true,
      hasPrivateKitchen ?? true,
      isSharedBathroom || false,
      isSharedToilet || false,
      isSharedKitchen || false,
      numberOfSharedUnits
    ];

    // Add geom values ONLY if exists
    const finalValues = hasGeom
      ? [...values, longitude, latitude]
      : values;

    const result = await pool.query(houseQuery, finalValues);
    const houseId = result.rows[0].id;

    // ======================
    // SAVE IMAGES
    // ======================
    for (let i = 0; i < imageUrls.length; i++) {
      await pool.query(
        `INSERT INTO house_images (house_id, image_url, display_order)
         VALUES ($1, $2, $3)`,
        [houseId, imageUrls[i], i]
      );
    }

    // ======================
    // SAVE VIDEOS
    // ======================
    for (let i = 0; i < videoUrls.length; i++) {
      await pool.query(
        `INSERT INTO house_videos (house_id, video_url, display_order)
         VALUES ($1, $2, $3)`,
        [houseId, videoUrls[i], i]
      );
    }

    await pool.query('COMMIT');

    res.status(201).json({
      message: 'Nyumba imeundwa kikamilifu!',
      houseId
    });

  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Create house error:', err);
    next(err);
  }
};