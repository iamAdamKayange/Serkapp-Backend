const express = require('express');
const {
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
router.get('/preferences', getAlertPreference);
router.put('/preferences', saveAlertPreference);
router.post('/devices', registerDeviceToken);
router.get('/saved-houses/:houseId', getSavedHouseStatus);
router.post('/saved-houses', saveHouse);
router.delete('/saved-houses/:houseId', removeSavedHouse);

module.exports = router;
