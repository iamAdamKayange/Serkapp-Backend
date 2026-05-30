const pool = require('../config/db');

class Location {
  constructor(row) {
    this.id = row.id;
    this.region = row.region;
    this.district = row.district;
    this.division = row.division;
    this.ward = row.ward;
    this.village = row.village;
    this.street = row.street;
    this.postcode = row.postcode;
  }

  // Get all distinct regions
  static async getRegions() {
    const result = await pool.query('SELECT DISTINCT region FROM locations WHERE region IS NOT NULL ORDER BY region');
    return result.rows.map(r => r.region);
  }

  // Get districts by region
  static async getDistricts(region) {
    const result = await pool.query('SELECT DISTINCT district FROM locations WHERE region = $1 AND district IS NOT NULL ORDER BY district', [region]);
    return result.rows.map(r => r.district);
  }

  // Get wards by region and district
  static async getWards(region, district) {
    const result = await pool.query('SELECT DISTINCT ward FROM locations WHERE region = $1 AND district = $2 AND ward IS NOT NULL ORDER BY ward', [region, district]);
    return result.rows.map(r => r.ward);
  }

  // Get streets by region, district, ward
  static async getStreets(region, district, ward) {
    const result = await pool.query('SELECT DISTINCT street FROM locations WHERE region = $1 AND district = $2 AND ward = $3 AND street IS NOT NULL ORDER BY street', [region, district, ward]);
    return result.rows.map(r => r.street);
  }

  // Optionally get villages if needed
  static async getVillages(region, district, ward) {
    const result = await pool.query('SELECT DISTINCT village FROM locations WHERE region = $1 AND district = $2 AND ward = $3 AND village IS NOT NULL ORDER BY village', [region, district, ward]);
    return result.rows.map(r => r.village);
  }
}

module.exports = Location;