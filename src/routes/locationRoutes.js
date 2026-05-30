const express = require('express');
const { getRegions, getDistricts, getWards, getStreets } = require('../controllers/locationController');

const router = express.Router();

router.get('/regions', getRegions);
router.get('/districts/:region', getDistricts);
router.get('/wards/:region/:district', getWards);
router.get('/streets/:region/:district/:ward', getStreets);

module.exports = router;