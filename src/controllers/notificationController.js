const {
  getAlertPreference,
  isHouseSaved,
  listNotifications,
  removeSavedHouse,
  saveAlertPreference,
  saveDeviceToken,
  saveHouse,
} = require('../services/notificationService');

exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await listNotifications({
      limit: req.query.limit,
      before: req.query.before,
    });
    res.json(notifications);
  } catch (error) {
    next(error);
  }
};

exports.getAlertPreference = async (req, res, next) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'FCM token inahitajika.' });
    }

    const preference = await getAlertPreference({ token });
    res.json(preference);
  } catch (error) {
    next(error);
  }
};

exports.saveAlertPreference = async (req, res, next) => {
  try {
    const {
      token,
      enabled,
      regions,
      districts,
      houseTypes,
      minRent,
      maxRent,
    } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'FCM token inahitajika.' });
    }

    const preference = await saveAlertPreference({
      token,
      enabled,
      regions,
      districts,
      houseTypes,
      minRent,
      maxRent,
    });

    res.json({
      message: 'Smart alert preferences zimehifadhiwa.',
      preference,
    });
  } catch (error) {
    next(error);
  }
};

exports.registerDeviceToken = async (req, res, next) => {
  try {
    const { token, platform, appVersion, userId } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'FCM token inahitajika.' });
    }

    const saved = await saveDeviceToken({ token, platform, appVersion, userId });
    res.status(201).json({ message: 'Device token imehifadhiwa.', id: saved.id });
  } catch (error) {
    next(error);
  }
};

exports.getSavedHouseStatus = async (req, res, next) => {
  try {
    const { token } = req.query;
    const { houseId } = req.params;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'FCM token inahitajika.' });
    }
    const saved = await isHouseSaved({ token, houseId });
    res.json({ saved });
  } catch (error) {
    next(error);
  }
};

exports.saveHouse = async (req, res, next) => {
  try {
    const { token, houseId } = req.body;
    if (!token || typeof token !== 'string' || !houseId) {
      return res.status(400).json({ error: 'Token na houseId zinahitajika.' });
    }
    const saved = await saveHouse({ token, houseId: String(houseId) });
    res.status(201).json({ message: 'Nyumba imehifadhiwa.', saved });
  } catch (error) {
    next(error);
  }
};

exports.removeSavedHouse = async (req, res, next) => {
  try {
    const { token } = req.query;
    const { houseId } = req.params;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'FCM token inahitajika.' });
    }
    await removeSavedHouse({ token, houseId });
    res.json({ message: 'Nyumba imeondolewa kwenye saved.' });
  } catch (error) {
    next(error);
  }
};
