const {
  dismissNotification,
  getAlertPreference,
  isHouseSaved,
  listNotifications,
  removeSavedHouse,
  saveAlertPreference,
  saveDeviceToken,
  saveHouse,
} = require('../services/notificationService');
const jwt = require('jsonwebtoken');

const optionalUserId = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.slice('Bearer '.length).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id || null;
  } catch (_) {
    return null;
  }
};

exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await listNotifications({
      limit: req.query.limit,
      before: req.query.before,
      token: req.query.token,
    });
    res.json(notifications);
  } catch (error) {
    next(error);
  }
};

exports.deleteNotification = async (req, res, next) => {
  try {
    const { token } = req.query;
    const { notificationId } = req.params;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'FCM token inahitajika.' });
    }
    if (!notificationId || !Number.isFinite(Number(notificationId))) {
      return res.status(400).json({ error: 'Notification id si sahihi.' });
    }

    await dismissNotification({ token, notificationId: Number(notificationId) });
    res.json({ message: 'Notification imefutwa kwenye kifaa hiki.' });
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

    await saveDeviceToken({
      token,
      platform: req.query.platform,
      userId: req.user.id,
    });
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

    await saveDeviceToken({
      token,
      platform: req.body.platform,
      appVersion: req.body.appVersion,
      userId: req.user.id,
    });
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
    const { token, platform, appVersion } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'FCM token inahitajika.' });
    }

    const saved = await saveDeviceToken({
      token,
      platform,
      appVersion,
      userId: optionalUserId(req),
    });
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
