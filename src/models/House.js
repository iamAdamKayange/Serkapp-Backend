const pool = require('../config/db');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (fanya hivi mara moja kwenye app.js au hapa)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

class House {
  constructor(row) {
    this.id = row.id;
    this.landlordId = row.landlord_id;
    // Fields from DB
    this.brandName = row.brand_name;        // jina maarufu
    this.ownerName = row.owner_name;        // jina la mwenye nyumba
    this.houseNumber = row.house_number;    // namba ya nyumba
    this.phone = row.phone;
    // For frontend compatibility (HouseData expects firstName, lastName, name, phone)
    this.firstName = row.brand_name;
    this.lastName = row.house_number;
    this.name = row.owner_name;             // frontend inatumia 'name' kwa owner name
    this.status = row.status;
    this.type = row.type;
    this.bedrooms = row.bedrooms;
    this.description = row.description;
    this.rentPrice = parseFloat(row.rent_price);
    this.depositAmount = row.deposit_amount ? parseFloat(row.deposit_amount) : null;
    this.locationAddress = row.location_address;
    this.address = row.location_address;    // compatibility
    this.location = row.location_address;   // compatibility
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
    // Media arrays – filled separately
    this.images = [];
    this.videos = [];
    this.videoThumbnails = [];
  }

  // Helper to load media from separate tables
  async loadMedia() {
    const imgRes = await pool.query('SELECT image_url FROM house_images WHERE house_id = $1', [this.id]);
    this.images = imgRes.rows.map(r => r.image_url);
    const vidRes = await pool.query('SELECT video_url FROM house_videos WHERE house_id = $1', [this.id]);
    this.videos = vidRes.rows.map(r => r.video_url);
    const thumbRes = await pool.query('SELECT thumbnail_url FROM house_video_thumbnails WHERE house_id = $1', [this.id]);
    this.videoThumbnails = thumbRes.rows.map(r => r.thumbnail_url);
    return this;
  }

  // Create new house with media
  static async create(data, landlordId) {
    const {
      firstName,          // brand_name
      lastName,           // house_number
      name,               // owner_name
      phone,
      status, type, bedrooms, description, rentPrice, depositAmount,
      locationAddress, latitude, longitude,
      region, district, division, ward, village, street,
      waterIncluded, electricityIncluded, internetIncluded, nearbyAmenities,
      hasCeiling, hasAluminium, hasCeilingBoard, hasTiles, hasFence,
      layoutType, hasPrivateBathroom, hasPrivateToilet, hasPrivateKitchen,
      isSharedBathroom, isSharedToilet, isSharedKitchen, numberOfSharedUnits,
      imageUrls = [], videoUrls = [], videoThumbnails = []
    } = data;

    let geom = null;
    if (latitude && longitude) {
      geom = `ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertHouseQuery = `
        INSERT INTO houses (
          landlord_id,
          brand_name, owner_name, house_number, phone,
          status, type, bedrooms, description,
          rent_price, deposit_amount,
          location_address, latitude, longitude, geom,
          region, district, division, ward, village, street,
          water_included, electricity_included, internet_included, nearby_amenities,
          has_ceiling, has_aluminium, has_ceiling_board, has_tiles, has_fence,
          layout_type, has_private_bathroom, has_private_toilet, has_private_kitchen,
          is_shared_bathroom, is_shared_toilet, is_shared_kitchen, number_of_shared_units
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,${geom || 'NULL'},$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)
        RETURNING id
      `;
      const values = [
        landlordId,
        firstName, name, lastName, phone,
        status || 'Inapatikana', type, bedrooms, description,
        rentPrice, depositAmount,
        locationAddress, latitude, longitude,
        region, district, division, ward, village, street,
        waterIncluded ?? false, electricityIncluded ?? false, internetIncluded ?? false, nearbyAmenities,
        hasCeiling ?? false, hasAluminium ?? false, hasCeilingBoard ?? false, hasTiles ?? false, hasFence ?? false,
        layoutType || 'self_container',
        hasPrivateBathroom ?? true, hasPrivateToilet ?? true, hasPrivateKitchen ?? true,
        isSharedBathroom ?? false, isSharedToilet ?? false, isSharedKitchen ?? false, numberOfSharedUnits
      ];
      const result = await client.query(insertHouseQuery, values);
      const houseId = result.rows[0].id;

      // Insert images
      for (const url of imageUrls) {
        await client.query('INSERT INTO house_images (house_id, image_url) VALUES ($1, $2)', [houseId, url]);
      }
      // Insert videos
      for (const url of videoUrls) {
        await client.query('INSERT INTO house_videos (house_id, video_url) VALUES ($1, $2)', [houseId, url]);
      }
      // Insert video thumbnails
      for (const url of videoThumbnails) {
        await client.query('INSERT INTO house_video_thumbnails (house_id, thumbnail_url) VALUES ($1, $2)', [houseId, url]);
      }

      await client.query('COMMIT');
      const newHouse = await House.findById(houseId);
      return newHouse;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Find house by ID with all media
  static async findById(id) {
    const houseQuery = 'SELECT * FROM houses WHERE id = $1';
    const houseResult = await pool.query(houseQuery, [id]);
    if (houseResult.rows.length === 0) return null;
    const house = new House(houseResult.rows[0]);
    await house.loadMedia();
    return house;
  }

  // Get all houses (with filters) for public view
  static async findAll(filters = {}) {
    let query = `
      SELECT h.*
      FROM houses h
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

    query += ` ORDER BY h.created_at DESC`;
    const result = await pool.query(query, values);
    const houses = [];
    for (const row of result.rows) {
      const house = new House(row);
      await house.loadMedia();
      houses.push(house);
    }
    return houses;
  }

  // Update house (partial) – also updates media if provided
  async update(updates) {
    const allowedFields = [
      'brand_name', 'owner_name', 'house_number', 'phone',
      'status', 'type', 'bedrooms', 'description',
      'rent_price', 'deposit_amount',
      'location_address', 'region', 'district', 'division', 'ward', 'village', 'street',
      'water_included', 'electricity_included', 'internet_included', 'nearby_amenities',
      'has_ceiling', 'has_aluminium', 'has_ceiling_board', 'has_tiles', 'has_fence',
      'layout_type', 'has_private_bathroom', 'has_private_toilet', 'has_private_kitchen',
      'is_shared_bathroom', 'is_shared_toilet', 'is_shared_kitchen', 'number_of_shared_units'
    ];
    const setClauses = [];
    const values = [];
    let idx = 1;

    // Map frontend field names to DB columns
    const fieldMap = {
      firstName: 'brand_name',
      lastName: 'house_number',
      name: 'owner_name',
      phone: 'phone',
      rentPrice: 'rent_price',
      depositAmount: 'deposit_amount',
      locationAddress: 'location_address',
      nearbyAmenities: 'nearby_amenities',
      hasCeiling: 'has_ceiling',
      hasAluminium: 'has_aluminium',
      hasCeilingBoard: 'has_ceiling_board',
      hasTiles: 'has_tiles',
      hasFence: 'has_fence',
      waterIncluded: 'water_included',
      electricityIncluded: 'electricity_included',
      internetIncluded: 'internet_included',
      layoutType: 'layout_type',
      hasPrivateBathroom: 'has_private_bathroom',
      hasPrivateToilet: 'has_private_toilet',
      hasPrivateKitchen: 'has_private_kitchen',
      isSharedBathroom: 'is_shared_bathroom',
      isSharedToilet: 'is_shared_toilet',
      isSharedKitchen: 'is_shared_kitchen',
      numberOfSharedUnits: 'number_of_shared_units'
    };

    for (const [frontField, dbField] of Object.entries(fieldMap)) {
      if (updates[frontField] !== undefined) {
        setClauses.push(`${dbField} = $${idx++}`);
        values.push(updates[frontField]);
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
    const updatedRow = result.rows[0];
    Object.assign(this, new House(updatedRow));

    // Handle media updates (replace if new arrays provided)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (updates.imageUrls !== undefined) {
        await client.query('DELETE FROM house_images WHERE house_id = $1', [this.id]);
        for (const url of updates.imageUrls) {
          await client.query('INSERT INTO house_images (house_id, image_url) VALUES ($1, $2)', [this.id, url]);
        }
      }
      if (updates.videoUrls !== undefined) {
        await client.query('DELETE FROM house_videos WHERE house_id = $1', [this.id]);
        for (const url of updates.videoUrls) {
          await client.query('INSERT INTO house_videos (house_id, video_url) VALUES ($1, $2)', [this.id, url]);
        }
      }
      if (updates.videoThumbnails !== undefined) {
        await client.query('DELETE FROM house_video_thumbnails WHERE house_id = $1', [this.id]);
        for (const url of updates.videoThumbnails) {
          await client.query('INSERT INTO house_video_thumbnails (house_id, thumbnail_url) VALUES ($1, $2)', [this.id, url]);
        }
      }
      await client.query('COMMIT');
      await this.loadMedia();
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this;
  }

  // Delete house and all its media from Cloudinary and DB
  async delete() {
    // Load current media
    await this.loadMedia();
    const allUrls = [...this.images, ...this.videos, ...this.videoThumbnails];

    // Delete from Cloudinary
    for (const url of allUrls) {
      try {
        const parts = url.split('/upload/');
        if (parts.length < 2) continue;
        let publicIdWithVersion = parts[1];
        let publicId = publicIdWithVersion.split('/').slice(1).join('/');
        publicId = publicId.replace(/\.[^/.]+$/, '');
        const resourceType = url.includes('video') ? 'video' : 'image';
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      } catch (err) {
        console.error(`Failed to delete from Cloudinary: ${url}`, err);
      }
    }

    // Delete from database (cascade will remove related media)
    await pool.query('DELETE FROM houses WHERE id = $1', [this.id]);
  }

  // Helper: Convert to JSON compatible with Flutter HouseData
  toJSON() {
    return {
      id: this.id.toString(),
      name: this.ownerName,            // jina la mwenye nyumba
      firstName: this.brandName,       // jina maarufu
      lastName: this.houseNumber,      // namba ya nyumba
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