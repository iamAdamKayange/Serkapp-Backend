const {
  dismissNotification,
  getAlertPreference,
  isHouseSaved,
  listNotifications,
  markNotificationAsRead,
  removeSavedHouse,
  saveAlertPreference,
  saveHouse,
} = require('../services/notificationService');

exports.getNotifications = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user?.role || null;
    const notifications = await listNotifications({
      limit: req.query.limit,
      before: req.query.before,
      token: req.query.token,
      installCutoffAt: req.query.installCutoffAt,
      userId: userId,
      userRole: userRole,
    });
    res.json(notifications);
  } catch (error) {
    next(error);
  }
};

exports.deleteNotification = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!notificationId || !Number.isFinite(Number(notificationId))) {
      return res.status(400).json({ error: 'Notification id si sahihi.' });
    }

    // User-specific notification deletion
    await dismissNotification({ userId, notificationId: Number(notificationId) });
    res.json({ message: 'Notification imefutwa.' });
  } catch (error) {
    next(error);
  }
};

exports.markNotificationAsRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!notificationId || !Number.isFinite(Number(notificationId))) {
      return res.status(400).json({ error: 'Notification id si sahihi.' });
    }

    // User-specific notification read marking
    await dismissNotification({ userId, notificationId: Number(notificationId) });
    res.json({ message: 'Notification imehifadhiwa kama isomwa.' });
  } catch (error) {
    next(error);
  }
};

exports.getAlertPreference = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const preference = await getAlertPreference({ userId });
    res.json(preference);
  } catch (error) {
    next(error);
  }
};

exports.saveAlertPreference = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      enabled,
      regions,
      districts,
      houseTypes,
      minRent,
      maxRent,
    } = req.body;

    const preference = await saveAlertPreference({
      userId,
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

exports.getSavedHouseStatus = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { houseId } = req.params;
    const saved = await isHouseSaved({ userId, houseId });
    res.json({ saved });
  } catch (error) {
    next(error);
  }
};

exports.saveHouse = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { houseId } = req.body;
    if (!houseId) {
      return res.status(400).json({ error: 'HouseId inahitajika.' });
    }
    const saved = await saveHouse({ userId, houseId: String(houseId) });
    res.status(201).json({ message: 'Nyumba imehifadhiwa.', saved });
  } catch (error) {
    next(error);
  }
};

exports.removeSavedHouse = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { houseId } = req.params;
    await removeSavedHouse({ userId, houseId });
    res.json({ message: 'Nyumba imeondolewa kwenye saved.' });
  } catch (error) {
    next(error);
  }
};
