const pool = require('../config/db');
const { sendToTokens } = require('./firebaseService');

const NEW_HOUSES_TOPIC = process.env.FCM_NEW_HOUSES_TOPIC || 'new_houses';

const normalizeList = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 20);
};

const normalizeMoney = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const ensureNotificationTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_device_tokens (
      id BIGSERIAL PRIMARY KEY,
      fcm_token TEXT NOT NULL UNIQUE,
      platform VARCHAR(32),
      app_version VARCHAR(64),
      user_id TEXT,
      install_cutoff_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE app_device_tokens
    ADD COLUMN IF NOT EXISTS install_cutoff_at TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_notifications (
      id BIGSERIAL PRIMARY KEY,
      type VARCHAR(80) NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      house_id TEXT,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      target_roles TEXT[] NOT NULL DEFAULT '{normal,landlord,admin}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE app_notifications
    ADD COLUMN IF NOT EXISTS target_roles TEXT[] NOT NULL DEFAULT '{normal,landlord,admin}'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_alert_preferences (
      fcm_token TEXT PRIMARY KEY REFERENCES app_device_tokens(fcm_token) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      regions TEXT[] NOT NULL DEFAULT '{}',
      districts TEXT[] NOT NULL DEFAULT '{}',
      house_types TEXT[] NOT NULL DEFAULT '{}',
      min_rent NUMERIC,
      max_rent NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_saved_houses (
      id BIGSERIAL PRIMARY KEY,
      fcm_token TEXT NOT NULL REFERENCES app_device_tokens(fcm_token) ON DELETE CASCADE,
      house_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (fcm_token, house_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_notification_dismissals (
      id BIGSERIAL PRIMARY KEY,
      fcm_token TEXT NOT NULL REFERENCES app_device_tokens(fcm_token) ON DELETE CASCADE,
      notification_id BIGINT NOT NULL REFERENCES app_notifications(id) ON DELETE CASCADE,
      dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (fcm_token, notification_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_app_notifications_created_at
    ON app_notifications (created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_app_notifications_target_roles
    ON app_notifications USING GIN (target_roles)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_houses_status_created_at
    ON houses (status, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_houses_landlord_id
    ON houses (landlord_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_house_videos_house_id
    ON house_videos (house_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_house_video_thumbnails_house_id
    ON house_video_thumbnails (house_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_video_comments_video_id
    ON video_comments (video_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_video_likes_video_user
    ON video_likes (video_id, user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_app_alert_preferences_enabled
    ON app_alert_preferences (enabled)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_app_saved_houses_token
    ON app_saved_houses (fcm_token, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_app_notification_dismissals_token
    ON app_notification_dismissals (fcm_token, dismissed_at DESC)
  `);

  // ==================== VIDEO LIKE & COMMENT TABLES ====================
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS video_comments (
      id BIGSERIAL PRIMARY KEY,
      video_id TEXT NOT NULL,
      house_id TEXT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      parent_id BIGINT,
      likes_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS video_likes (
      id BIGSERIAL PRIMARY KEY,
      video_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (video_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comment_likes (
      id BIGSERIAL PRIMARY KEY,
      comment_id BIGINT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (comment_id, user_id)
    )
  `);

  // Indexes for video like and comment tables
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_video_comments_video_id
    ON video_comments (video_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_video_comments_house_id
    ON video_comments (house_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_video_comments_user_id
    ON video_comments (user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_video_comments_parent_id
    ON video_comments (parent_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_video_likes_video_user
    ON video_likes (video_id, user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_video_likes_user_id
    ON video_likes (user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_user
    ON comment_likes (comment_id, user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id
    ON comment_likes (user_id)
  `);

  // ==================== LANDLORD VERIFICATION TABLES ====================
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS landlord_identity_verification (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      nin_number TEXT,
      id_photo_url TEXT,
      selfie_photo_url TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      admin_notes TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS landlord_property_verification (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      property_document_url TEXT,
      property_photos TEXT[] NOT NULL DEFAULT '{}',
      latitude NUMERIC,
      longitude NUMERIC,
      address TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      admin_notes TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id)
    )
  `);

  // Indexes for landlord verification tables
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_landlord_identity_verification_user_id
    ON landlord_identity_verification (user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_landlord_identity_verification_status
    ON landlord_identity_verification (status)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_landlord_property_verification_user_id
    ON landlord_property_verification (user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_landlord_property_verification_status
    ON landlord_property_verification (status)
  `);
};

const saveDeviceToken = async ({
  token,
  platform,
  appVersion,
  userId,
  installCutoffAt,
}) => {
  const result = await pool.query(
    `
      INSERT INTO app_device_tokens (
        fcm_token,
        platform,
        app_version,
        user_id,
        install_cutoff_at
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (fcm_token)
      DO UPDATE SET
        platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version,
        user_id = COALESCE(EXCLUDED.user_id, app_device_tokens.user_id),
        install_cutoff_at = COALESCE(
          EXCLUDED.install_cutoff_at,
          app_device_tokens.install_cutoff_at
        ),
        updated_at = NOW(),
        last_seen_at = NOW()
      RETURNING id
    `,
    [token, platform, appVersion, userId, normalizeDate(installCutoffAt)],
  );

  return result.rows[0];
};

const listNotifications = async ({
  limit = 50,
  before,
  token,
  installCutoffAt,
  userRole,
} = {}) => {
  const values = [Math.min(Math.max(Number(limit) || 50, 1), 100)];
  const conditions = [];
  const normalizedInstallCutoffAt = normalizeDate(installCutoffAt);

  if (before) {
    values.push(before);
    conditions.push(`app_notifications.created_at < $${values.length}`);
  }

  if (normalizedInstallCutoffAt) {
    values.push(normalizedInstallCutoffAt);
    conditions.push(`app_notifications.created_at >= $${values.length}::timestamptz`);
  }

  if (token) {
    values.push(token);
    conditions.push(`
      app_notifications.created_at >= COALESCE(
        (
          SELECT dt.install_cutoff_at
          FROM app_device_tokens dt
          WHERE dt.fcm_token = $${values.length}
          LIMIT 1
        ),
        (
          SELECT dt.created_at
          FROM app_device_tokens dt
          WHERE dt.fcm_token = $${values.length}
          LIMIT 1
        ),
        '-infinity'::timestamptz
      )
      AND
      NOT EXISTS (
        SELECT 1
        FROM app_notification_dismissals dismissed
        WHERE dismissed.notification_id = app_notifications.id
          AND dismissed.fcm_token = $${values.length}
      )
    `);
  }

  // Role-based filtering
  if (userRole) {
    values.push(userRole);
    conditions.push(`
      EXISTS (
        SELECT 1 
        FROM unnest(app_notifications.target_roles) AS role
        WHERE role = $${values.length}
      )
    `);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `
      SELECT id, type, title, body, house_id, data, created_at
      FROM app_notifications
      ${where}
      ORDER BY created_at DESC
      LIMIT $1
    `,
    values,
  );

  return result.rows;
};

const dismissNotification = async ({ token, notificationId }) => {
  // Insert dismissal record to permanently remove notification for this user
  await pool.query(
    `
      INSERT INTO app_notification_dismissals (fcm_token, notification_id, dismissed_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (fcm_token, notification_id)
      DO UPDATE SET dismissed_at = NOW()
    `,
    [token, notificationId],
  );
  
  // Optional: Also add user-specific tracking if user_id is available
  // This would allow for better cleanup and management
};

const getAlertPreference = async ({ token }) => {
  const result = await pool.query(
    `
      SELECT
        enabled,
        regions,
        districts,
        house_types AS "houseTypes",
        min_rent AS "minRent",
        max_rent AS "maxRent",
        updated_at
      FROM app_alert_preferences
      WHERE fcm_token = $1
    `,
    [token],
  );

  return result.rows[0] || {
    enabled: false,
    regions: [],
    districts: [],
    houseTypes: [],
    minRent: null,
    maxRent: null,
  };
};

const saveAlertPreference = async ({
  token,
  enabled,
  regions,
  districts,
  houseTypes,
  minRent,
  maxRent,
}) => {
  const result = await pool.query(
    `
      INSERT INTO app_alert_preferences (
        fcm_token,
        enabled,
        regions,
        districts,
        house_types,
        min_rent,
        max_rent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (fcm_token)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        regions = EXCLUDED.regions,
        districts = EXCLUDED.districts,
        house_types = EXCLUDED.house_types,
        min_rent = EXCLUDED.min_rent,
        max_rent = EXCLUDED.max_rent,
        updated_at = NOW()
      RETURNING
        enabled,
        regions,
        districts,
        house_types AS "houseTypes",
        min_rent AS "minRent",
        max_rent AS "maxRent",
        updated_at
    `,
    [
      token,
      enabled === true,
      normalizeList(regions),
      normalizeList(districts),
      normalizeList(houseTypes),
      normalizeMoney(minRent),
      normalizeMoney(maxRent),
    ],
  );

  return result.rows[0];
};

const findMatchingAlertTokens = async ({
  region,
  district,
  houseType,
  rentPrice,
}) => {
  const result = await pool.query(
    `
      SELECT DISTINCT dt.fcm_token
      FROM app_device_tokens dt
      INNER JOIN app_alert_preferences pref
        ON pref.fcm_token = dt.fcm_token
      WHERE pref.enabled = TRUE
        AND dt.user_id IS NOT NULL
        AND (
          cardinality(pref.regions) = 0
          OR EXISTS (
            SELECT 1 FROM unnest(pref.regions) AS item(value)
            WHERE LOWER(item.value) = LOWER(COALESCE($1, ''))
          )
        )
        AND (
          cardinality(pref.districts) = 0
          OR EXISTS (
            SELECT 1 FROM unnest(pref.districts) AS item(value)
            WHERE LOWER(item.value) = LOWER(COALESCE($2, ''))
          )
        )
        AND (
          cardinality(pref.house_types) = 0
          OR EXISTS (
            SELECT 1 FROM unnest(pref.house_types) AS item(value)
            WHERE LOWER(item.value) = LOWER(COALESCE($3, ''))
          )
        )
        AND (pref.min_rent IS NULL OR $4::numeric IS NULL OR $4::numeric >= pref.min_rent)
        AND (pref.max_rent IS NULL OR $4::numeric IS NULL OR $4::numeric <= pref.max_rent)
    `,
    [region || null, district || null, houseType || null, normalizeMoney(rentPrice)],
  );

  return result.rows.map((row) => row.fcm_token);
};

const findAllDeviceTokens = async ({ excludeTokens = [] } = {}) => {
  const result = await pool.query(
    `
      SELECT DISTINCT fcm_token
      FROM app_device_tokens
      WHERE last_seen_at > NOW() - INTERVAL '120 days'
        AND NOT (fcm_token = ANY($1::text[]))
    `,
    [excludeTokens],
  );

  return result.rows.map((row) => row.fcm_token);
};

const deleteInvalidTokens = async (invalidTokens = []) => {
  if (!Array.isArray(invalidTokens) || invalidTokens.length === 0) return;
  await pool.query(
    `DELETE FROM app_device_tokens WHERE fcm_token = ANY($1::text[])`,
    [invalidTokens],
  );
};

const isHouseSaved = async ({ token, houseId }) => {
  const result = await pool.query(
    `
      SELECT 1
      FROM app_saved_houses
      WHERE fcm_token = $1 AND house_id = $2
      LIMIT 1
    `,
    [token, houseId],
  );
  return result.rowCount > 0;
};

const saveHouse = async ({ token, houseId }) => {
  const result = await pool.query(
    `
      INSERT INTO app_saved_houses (fcm_token, house_id)
      VALUES ($1, $2)
      ON CONFLICT (fcm_token, house_id) DO NOTHING
      RETURNING id, house_id, created_at
    `,
    [token, houseId],
  );
  return result.rows[0] || { house_id: houseId };
};

const removeSavedHouse = async ({ token, houseId }) => {
  await pool.query(
    `
      DELETE FROM app_saved_houses
      WHERE fcm_token = $1 AND house_id = $2
    `,
    [token, houseId],
  );
};

const createHouseCreatedNotification = async ({
  houseId,
  landlordId,
  houseName,
  location,
  rentPrice,
  region,
  district,
  houseType,
}) => {
  const title = 'Nyumba mpya imeongezwa';
  const bodyParts = [
    houseName || 'Nyumba mpya',
    location ? `eneo la ${location}` : null,
    rentPrice ? `TZS ${Number(rentPrice).toLocaleString('en-US')}/mwezi` : null,
  ].filter(Boolean);
  const body = bodyParts.length > 0
    ? bodyParts.join(' - ')
    : 'Fungua SERIK kuona nyumba mpya iliyoongezwa.';

  const data = {
    houseId,
    landlordId,
    region,
    district,
    houseType,
    type: 'house_created',
    click_action: 'FLUTTER_NOTIFICATION_CLICK',
  };

  const result = await pool.query(
    `
      INSERT INTO app_notifications (type, title, body, house_id, data, target_roles)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::text[])
      RETURNING id, type, title, body, house_id, data, created_at
    `,
    ['house_created', title, body, houseId, JSON.stringify(data), ['normal', 'landlord', 'admin']],
  );

  try {
    const matchingTokens = await findMatchingAlertTokens({
      region,
      district,
      houseType,
      rentPrice,
    });

    const smartTitle = 'Nyumba inayofanana na filter zako';
    const smartDelivery = await sendToTokens({
      tokens: matchingTokens,
      title: smartTitle,
      body,
      data,
    });
    await deleteInvalidTokens(smartDelivery.invalidTokens);

    const generalTokens = await findAllDeviceTokens({
      excludeTokens: matchingTokens,
    });
    const generalDelivery = await sendToTokens({
      tokens: generalTokens,
      title,
      body,
      data,
    });
    await deleteInvalidTokens(generalDelivery.invalidTokens);
  } catch (error) {
    console.error('Failed to send house FCM notification:', error);
  }

  return result.rows[0];
};

module.exports = {
  NEW_HOUSES_TOPIC,
  ensureNotificationTables,
  saveDeviceToken,
  listNotifications,
  dismissNotification,
  getAlertPreference,
  saveAlertPreference,
  isHouseSaved,
  saveHouse,
  removeSavedHouse,
  createHouseCreatedNotification,
};
