const pool = require('../config/db');

exports.getRegions = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT DISTINCT region FROM locations ORDER BY region');
    res.json(result.rows.map(r => r.region));
  } catch (err) { next(err); }
};

exports.getDistricts = async (req, res, next) => {
  const { region } = req.params;
  try {
    const result = await pool.query('SELECT DISTINCT district FROM locations WHERE region = $1 ORDER BY district', [region]);
    res.json(result.rows.map(r => r.district));
  } catch (err) { next(err); }
};

exports.getWards = async (req, res, next) => {
  const { region, district } = req.params;
  try {
    const result = await pool.query('SELECT DISTINCT ward FROM locations WHERE region = $1 AND district = $2 ORDER BY ward', [region, district]);
    res.json(result.rows.map(r => r.ward));
  } catch (err) { next(err); }
};

exports.getStreets = async (req, res, next) => {
  const { region, district, ward } = req.params;
  try {
    const result = await pool.query('SELECT DISTINCT street FROM locations WHERE region = $1 AND district = $2 AND ward = $3 ORDER BY street', [region, district, ward]);
    res.json(result.rows.map(r => r.street));
  } catch (err) { next(err); }
};