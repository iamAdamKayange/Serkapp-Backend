const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  deleteNotification,
  getAlertPreference,
  getNotifications,
  getSavedHouseStatus,
  registerDeviceToken,
  removeSavedHouse,
  saveAlertPreference,
  saveHouse,
} = require('../controllers/notificationController');

const router = express.Router();

router.get('/', getNotifications);
router.get('/preferences', authMiddleware, getAlertPreference);
router.put('/preferences', authMiddleware, saveAlertPreference);
router.post('/devices', registerDeviceToken);
router.get('/saved-houses/:houseId', getSavedHouseStatus);
router.post('/saved-houses', saveHouse);
router.delete('/saved-houses/:houseId', removeSavedHouse);
router.delete('/:notificationId', deleteNotification);

module.exports = router;
