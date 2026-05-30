const pool = require('../config/db');

class HouseImage {
  constructor(row) {
    this.id = row.id;
    this.houseId = row.house_id;
    this.imageUrl = row.image_url;
    this.displayOrder = row.display_order;
    this.createdAt = row.created_at;
  }

  // Add image to house
  static async create(houseId, imageUrl, displayOrder = null) {
    const order = displayOrder !== null ? displayOrder : await this.getNextOrder(houseId);
    const result = await pool.query(
      `INSERT INTO house_images (house_id, image_url, display_order)
       VALUES ($1, $2, $3) RETURNING *`,
      [houseId, imageUrl, order]
    );
    return new HouseImage(result.rows[0]);
  }

  // Get next display order for house
  static async getNextOrder(houseId) {
    const result = await pool.query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM house_images WHERE house_id = $1`,
      [houseId]
    );
    return result.rows[0].next_order;
  }

  // Get all images for a house
  static async findByHouseId(houseId) {
    const result = await pool.query(
      `SELECT * FROM house_images WHERE house_id = $1 ORDER BY display_order`,
      [houseId]
    );
    return result.rows.map(row => new HouseImage(row));
  }

  // Delete an image
  async delete() {
    await pool.query('DELETE FROM house_images WHERE id = $1', [this.id]);
  }

  // Delete all images for a house
  static async deleteByHouseId(houseId) {
    await pool.query('DELETE FROM house_images WHERE house_id = $1', [houseId]);
  }
}

module.exports = HouseImage;