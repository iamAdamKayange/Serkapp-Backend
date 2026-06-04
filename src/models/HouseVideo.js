// src/models/HouseVideo.js
const pool = require('../config/db');

class HouseVideo {
  constructor(row) {
    this.id = row.id;
    this.houseId = row.house_id;
    this.videoUrl = row.video_url;
    this.thumbnailUrl = row.thumbnail_url;
    this.publicId = row.public_id;
    this.displayOrder = row.display_order;
    this.createdAt = row.created_at;
  }

  static async create(houseId, videoUrl, publicId, thumbnailUrl = null, displayOrder = null) {
    const order = displayOrder !== null ? displayOrder : await this.getNextOrder(houseId);
    const result = await pool.query(
      `INSERT INTO house_videos (house_id, video_url, public_id, thumbnail_url, display_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [houseId, videoUrl, publicId, thumbnailUrl, order]
    );
    return new HouseVideo(result.rows[0]);
  }

  static async getNextOrder(houseId) {
    const result = await pool.query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM house_videos WHERE house_id = $1`,
      [houseId]
    );
    return result.rows[0].next_order;
  }

  static async findByHouseId(houseId) {
    const result = await pool.query(
      `SELECT * FROM house_videos WHERE house_id = $1 ORDER BY display_order`,
      [houseId]
    );
    return result.rows.map(row => new HouseVideo(row));
  }

  static async findById(id) {
    const result = await pool.query(`SELECT * FROM house_videos WHERE id = $1`, [id]);
    return result.rows.length ? new HouseVideo(result.rows[0]) : null;
  }

  async delete() {
    await pool.query(`DELETE FROM house_videos WHERE id = $1`, [this.id]);
  }
}

module.exports = HouseVideo;