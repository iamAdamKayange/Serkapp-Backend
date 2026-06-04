const pool = require('../config/db');

class House {
  constructor(row) {
    this.id = row.id;
    this.landlordId = row.landlord_id;  // optional, unaweza kuondoa kama hutumii
    this.name = row.name;
    this.status = row.status;
    this.type = row.type;
    this.bedrooms = row.bedrooms;
    this.description = row.description;
    this.firstName = row.first_name;
    this.lastName = row.last_name;
    this.phone = row.phone;
    this.rentPrice = parseFloat(row.rent_price);
    this.depositAmount = row.deposit_amount ? parseFloat(row.deposit_amount) : null;
    this.location = row.location_address;  // kwa compatibility na Flutter
    this.address = row.location_address;
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
    this.images = row.images || [];      // kutoka house_images
    this.videos = row.videos || [];
    this.videoThumbnails = row.video_thumbnails || [];
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  // Create new house
  static async create(data) {
    const {
      landlordId, name, status, type, bedrooms, description,
      firstName, lastName, phone,
      rentPrice, depositAmount,
      locationAddress, latitude, longitude,
      region, district, division, ward, village, street,
      waterIncluded, electricityIncluded, internetIncluded, nearbyAmenities,
      hasCeiling, hasAluminium, hasCeilingBoard, hasTiles, hasFence,
      layoutType, hasPrivateBathroom, hasPrivateToilet, hasPrivateKitchen,
      isSharedBathroom, isSharedToilet, isSharedKitchen, numberOfSharedUnits,
      videos = [], videoThumbnails = []
    } = data;

    let geom = null;
    if (latitude && longitude) {
      geom = `ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`;
    }

    const query = `
      INSERT INTO houses (
        landlord_id, name, status, type, bedrooms, description,
        first_name, last_name, phone,
        rent_price, deposit_amount,
        location_address, latitude, longitude, geom,
        region, district, division, ward, village, street,
        water_included, electricity_included, internet_included, nearby_amenities,
        has_ceiling, has_aluminium, has_ceiling_board, has_tiles, has_fence,
        layout_type, has_private_bathroom, has_private_toilet, has_private_kitchen,
        is_shared_bathroom, is_shared_toilet, is_shared_kitchen, number_of_shared_units,
        videos, video_thumbnails
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,${geom || 'NULL'},$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37)
      RETURNING *
    `;
    const values = [
      landlordId || null, name, status || 'Inapatikana', type, bedrooms, description,
      firstName, lastName, phone,
      rentPrice, depositAmount,
      locationAddress, latitude, longitude,
      region, district, division, ward, village, street,
      waterIncluded ?? false, electricityIncluded ?? false, internetIncluded ?? false, nearbyAmenities,
      hasCeiling ?? false, hasAluminium ?? false, hasCeilingBoard ?? false, hasTiles ?? false, hasFence ?? false,
      layoutType || 'self_container',
      hasPrivateBathroom ?? true, hasPrivateToilet ?? true, hasPrivateKitchen ?? true,
      isSharedBathroom ?? false, isSharedToilet ?? false, isSharedKitchen ?? false, numberOfSharedUnits,
      videos, videoThumbnails
    ];
    const result = await pool.query(query, values);
    return new House(result.rows[0]);
  }

  // Find by ID with images, videos, thumbnails
  static async findById(id) {
    const query = `
      SELECT h.*, 
        COALESCE(array_agg(DISTINCT hi.image_url) FILTER (WHERE hi.image_url IS NOT NULL), '{}') as images
      FROM houses h
      LEFT JOIN house_images hi ON h.id = hi.house_id
      WHERE h.id = $1
      GROUP BY h.id
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    return new House(result.rows[0]);
  }

  // Get all houses with filters
  static async findAll(filters = {}) {
    let query = `
      SELECT h.*, 
        COALESCE(array_agg(DISTINCT hi.image_url) FILTER (WHERE hi.image_url IS NOT NULL), '{}') as images
      FROM houses h
      LEFT JOIN house_images hi ON h.id = hi.house_id
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
      query += ` AND (h.name ILIKE $${idx++} OR h.location_address ILIKE $${idx++} OR h.ward ILIKE $${idx++} OR h.first_name ILIKE $${idx++} OR h.last_name ILIKE $${idx++})`;
      const pattern = `%${filters.search}%`;
      values.push(pattern, pattern, pattern, pattern, pattern);
    }

    query += ` GROUP BY h.id ORDER BY h.created_at DESC`;
    const result = await pool.query(query, values);
    return result.rows.map(row => new House(row));
  }

  // Update house (partial) - pamoja na first_name, last_name, phone, videos, video_thumbnails
  async update(updates) {
    const allowedFields = [
      'name', 'status', 'type', 'bedrooms', 'description',
      'first_name', 'last_name', 'phone',
      'rent_price', 'deposit_amount',
      'location_address', 'region', 'district', 'division', 'ward', 'village', 'street',
      'water_included', 'electricity_included', 'internet_included', 'nearby_amenities',
      'has_ceiling', 'has_aluminium', 'has_ceiling_board', 'has_tiles', 'has_fence',
      'layout_type', 'has_private_bathroom', 'has_private_toilet', 'has_private_kitchen',
      'is_shared_bathroom', 'is_shared_toilet', 'is_shared_kitchen', 'number_of_shared_units',
      'videos', 'video_thumbnails'
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
    // Handle geometry update if lat/lng provided
    if (updates.latitude !== undefined && updates.longitude !== undefined) {
      setClauses.push(`latitude = $${idx++}, longitude = $${idx++}, geom = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
      values.push(updates.latitude, updates.longitude, updates.longitude, updates.latitude);
    }
    if (setClauses.length === 0) return this;
    setClauses.push('updated_at = NOW()');
    values.push(this.id);
    const query = `UPDATE houses SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);
    return new House(result.rows[0]);
  }

  // Delete house
  async delete() {
    await pool.query('DELETE FROM houses WHERE id = $1', [this.id]);
  }

  // Helper: Convert to JSON compatible with Flutter HouseData
  toJSON() {
    return {
      id: this.id.toString(),
      name: this.name,
      status: this.status,
      type: this.type,
      bedrooms: this.bedrooms,
      description: this.description,
      firstName: this.firstName,
      lastName: this.lastName,
      phone: this.phone,
      rentPrice: this.rentPrice,
      depositAmount: this.depositAmount,
      location: this.location,
      address: this.address,
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