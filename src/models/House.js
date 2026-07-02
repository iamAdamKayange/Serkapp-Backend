const pool = require('../config/db');
const { deleteFromSpaces } = require('../services/imageUploadService');

class House {
  constructor(row) {
    this.id = row.id;
    this.landlordId = row.landlord_id;
    this.brandName = row.brand_name;
    this.ownerName = row.owner_name;
    this.houseNumber = row.house_number;
    this.phone = row.phone;
    this.firstName = row.brand_name;
    this.lastName = row.house_number;
    this.name = row.owner_name;
    this.status = row.status;
    this.type = row.type;
    this.bedrooms = row.bedrooms;
    this.description = row.description;
    this.rentPrice = parseFloat(row.rent_price);
    this.depositAmount = row.deposit_amount ? parseFloat(row.deposit_amount) : null;
    this.locationAddress = row.location_address;
    this.address = row.location_address;
    this.location = row.location_address;
    this.latitude = row.latitude ? parseFloat(row.latitude) : null;
    this.longitude = row.longitude ? parseFloat(row.longitude) : null;
    this.geom = row.geom;
    this.region = row.region;
    this.district = row.district;
    this.division = row.division;
    this.ward = row.ward;
    this.village = row.village;
    this.street = row.street;
    this.waterIncluded = row.water_included;
    this.electricityIncluded = row.electricity_included;
    this.internetIncluded = row.internet_included;
    this.nearbyAmenities = row.nearby_amenities;
    this.hasCeiling = row.has_ceiling;
    this.hasAluminium = row.has_aluminium;
    this.hasCeilingBoard = row.has_ceiling_board;
    this.hasTiles = row.has_tiles;
    this.hasFence = row.has_fence;
    this.layoutType = row.layout_type;
    this.hasPrivateBathroom = row.has_private_bathroom;
    this.hasPrivateToilet = row.has_private_toilet;
    this.hasPrivateKitchen = row.has_private_kitchen;
    this.isSharedBathroom = row.is_shared_bathroom;
    this.isSharedToilet = row.is_shared_toilet;
    this.isSharedKitchen = row.is_shared_kitchen;
    this.numberOfSharedUnits = row.number_of_shared_units;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
    this.images = row.images || [];
    this.videos = row.videos || [];
    this.videoThumbnails = row.video_thumbnails || [];
  }

  static async findById(id) {
    const query = `
      SELECT 
        h.*,
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
    if (result.rows.length === 0) return null;
    return new House(result.rows[0]);
  }

  static async findAll(filters = {}) {
    let query = `
      SELECT 
        h.*,
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
      WHERE 1=1
    `;
    const values = [];
    let idx = 1;

    if (filters.status) {
      query += ` AND h.status = $${idx++}`;
      values.push(filters.status);
    }
    if (filters.landlordId) {
      query += ` AND h.landlord_id = $${idx++}`;
      values.push(filters.landlordId);
    }
    if (filters.minPrice) {
      query += ` AND h.rent_price >= $${idx++}`;
      values.push(filters.minPrice);
    }
    if (filters.maxPrice) {
      query += ` AND h.rent_price <= $${idx++}`;
      values.push(filters.maxPrice);
    }
    if (filters.type && filters.type !== 'Zote') {
      query += ` AND h.type = $${idx++}`;
      values.push(filters.type);
    }
    if (filters.search) {
      query += ` AND (h.brand_name ILIKE $${idx++} OR h.owner_name ILIKE $${idx++} OR h.house_number ILIKE $${idx++} OR h.location_address ILIKE $${idx++} OR h.ward ILIKE $${idx++})`;
      const pattern = `%${filters.search}%`;
      values.push(pattern, pattern, pattern, pattern, pattern);
    }

    query += ` GROUP BY h.id ORDER BY h.created_at DESC`;
    const result = await pool.query(query, values);
    return result.rows.map(row => new House(row));
  }

  static async create(data, landlordId) {
    const {
      firstName, lastName, name, phone,
      status, type, bedrooms, description, rentPrice, depositAmount,
      locationAddress, latitude, longitude,
      region, district, division, ward, village, street,
      waterIncluded, electricityIncluded, internetIncluded, nearbyAmenities,
      hasCeiling, hasAluminium, hasCeilingBoard, hasTiles, hasFence,
      layoutType, hasPrivateBathroom, hasPrivateToilet, hasPrivateKitchen,
      isSharedBathroom, isSharedToilet, isSharedKitchen, numberOfSharedUnits,
      imageUrls = [], videoUrls = [], videoThumbnails = []
    } = data;

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

      for (let i = 0; i < imageUrls.length; i++) {
        await client.query(
          `INSERT INTO house_images (house_id, image_url, display_order) VALUES ($1, $2, $3)`,
          [houseId, imageUrls[i], i]
        );
      }
      for (let i = 0; i < videoUrls.length; i++) {
        await client.query(
          `INSERT INTO house_videos (house_id, video_url, display_order) VALUES ($1, $2, $3)`,
          [houseId, videoUrls[i], i]
        );
      }
      for (let i = 0; i < videoThumbnails.length; i++) {
        await client.query(
          `INSERT INTO house_video_thumbnails (house_id, thumbnail_url, display_order) VALUES ($1, $2, $3)`,
          [houseId, videoThumbnails[i], i]
        );
      }

      await client.query('COMMIT');
      return await House.findById(houseId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async update(updates) {
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

    if (setClauses.length === 0) return this;
    setClauses.push('updated_at = NOW()');
    values.push(this.id);
    const query = `UPDATE houses SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);
    const updatedRow = result.rows[0];
    Object.assign(this, new House(updatedRow));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (updates.imageUrls !== undefined) {
        await client.query('DELETE FROM house_images WHERE house_id = $1', [this.id]);
        for (let i = 0; i < updates.imageUrls.length; i++) {
          await client.query(
            'INSERT INTO house_images (house_id, image_url, display_order) VALUES ($1, $2, $3)',
            [this.id, updates.imageUrls[i], i]
          );
        }
      }
      if (updates.videoUrls !== undefined) {
        await client.query('DELETE FROM house_videos WHERE house_id = $1', [this.id]);
        for (let i = 0; i < updates.videoUrls.length; i++) {
          await client.query(
            'INSERT INTO house_videos (house_id, video_url, display_order) VALUES ($1, $2, $3)',
            [this.id, updates.videoUrls[i], i]
          );
        }
      }
      if (updates.videoThumbnails !== undefined) {
        await client.query('DELETE FROM house_video_thumbnails WHERE house_id = $1', [this.id]);
        for (let i = 0; i < updates.videoThumbnails.length; i++) {
          await client.query(
            'INSERT INTO house_video_thumbnails (house_id, thumbnail_url, display_order) VALUES ($1, $2, $3)',
            [this.id, updates.videoThumbnails[i], i]
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this;
  }

  async delete() {
    const allUrls = [...this.images, ...this.videos, ...this.videoThumbnails];
    for (const url of allUrls) {
      await deleteFromSpaces(url);
    }
    await pool.query('DELETE FROM houses WHERE id = $1', [this.id]);
  }

  toJSON() {
    return {
      id: this.id.toString(),
      name: this.ownerName,
      firstName: this.brandName,
      lastName: this.houseNumber,
      phone: this.phone,
      status: this.status,
      type: this.type,
      bedrooms: this.bedrooms,
      description: this.description,
      rentPrice: this.rentPrice,
      depositAmount: this.depositAmount,
      location: this.locationAddress,
      address: this.locationAddress,
      latitude: this.latitude,
      longitude: this.longitude,
      region: this.region,
      district: this.district,
      division: this.division,
      ward: this.ward,
      village: this.village,
      street: this.street,
      images: this.images,
      videos: this.videos,
      videoThumbnails: this.videoThumbnails,
      waterIncluded: this.waterIncluded,
      electricityIncluded: this.electricityIncluded,
      internetIncluded: this.internetIncluded,
      nearbyAmenities: this.nearbyAmenities,
      hasCeiling: this.hasCeiling,
      hasAluminium: this.hasAluminium,
      hasCeilingBoard: this.hasCeilingBoard,
      hasTiles: this.hasTiles,
      hasFence: this.hasFence,
      layoutType: this.layoutType,
      hasPrivateBathroom: this.hasPrivateBathroom,
      hasPrivateToilet: this.hasPrivateToilet,
      hasPrivateKitchen: this.hasPrivateKitchen,
      isSharedBathroom: this.isSharedBathroom,
      isSharedToilet: this.isSharedToilet,
      isSharedKitchen: this.isSharedKitchen,
      numberOfSharedUnits: this.numberOfSharedUnits,
      createdAt: this.createdAt ? this.createdAt.toISOString() : null,
    };
  }
}

module.exports = House;