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
// PUBLIC ROUTES
// ======================
router.get('/', getAllHouses);
router.get('/:id', getHouseById);

// ======================
// PROTECTED ROUTES (must come AFTER public but BEFORE dynamic :id? Actually no conflict)
// BUT '/landlord/my-houses' must be BEFORE '/:id' to avoid treating 'landlord' as id
// However we already have GET /:id - that would catch /landlord/my-houses? No, because /:id expects one segment, not two.
// But better to keep landlord specific routes before generic :id for safety.
// Actually the original ordering caused no problem for GET, but the error was about missing callback.
// I'll keep proper order.
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