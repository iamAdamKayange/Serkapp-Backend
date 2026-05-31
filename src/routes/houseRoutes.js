const express = require('express');
const { authMiddleware, landlordOnly } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  uploadMedia,
  createHouse,
  getAllHouses,
  getHouseById,
  getMyHouses,
  updateHouse,
  deleteHouse,
  addHouseImage,
  addHouseVideo,
  deleteHouseImage,
  deleteHouseVideo
} = require('../controllers/houseController');

const router = express.Router();

// ======================
// PUBLIC ROUTES (hakuna ulinzi)
// ======================
router.get('/', getAllHouses);
router.get('/:id', getHouseById);

// ======================
// PROTECTED ROUTES (zinahitaji uthibitishaji na ruhusa za landlord)
// ======================
router.post('/upload-media', authMiddleware, landlordOnly, upload.array('files', 20), uploadMedia);
router.post('/', authMiddleware, landlordOnly, createHouse);
router.get('/landlord/my-houses', authMiddleware, landlordOnly, getMyHouses);

router.put('/:id', authMiddleware, landlordOnly, updateHouse);
router.delete('/:id', authMiddleware, landlordOnly, deleteHouse);

router.post('/:id/images', authMiddleware, landlordOnly, addHouseImage);
router.post('/:id/videos', authMiddleware, landlordOnly, addHouseVideo);

router.delete('/images/:imageId', authMiddleware, landlordOnly, deleteHouseImage);
router.delete('/videos/:videoId', authMiddleware, landlordOnly, deleteHouseVideo);

module.exports = router;