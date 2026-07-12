const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

let initialized = false;

const parseServiceAccount = () => {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson) return JSON.parse(rawJson);

  const base64Json = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64Json) {
    return JSON.parse(Buffer.from(base64Json, 'base64').toString('utf8'));
  }

  return null;
};

const initFirebaseAdmin = () => {
  if (initialized || getApps().length > 0) {
    initialized = true;
    return true;
  }

  try {
    const serviceAccount = parseServiceAccount();
    if (serviceAccount) {
      initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
      });
    }
    initialized = true;
    console.log('Firebase Admin initialized');
    return true;
  } catch (error) {
    console.warn(
      'Firebase Admin not initialized. Set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_BASE64, or GOOGLE_APPLICATION_CREDENTIALS to enable FCM.',
    );
    console.warn(error.message);
    return false;
  }
};

const sendToTopic = async ({ topic, title, body, data = {} }) => {
  if (!initFirebaseAdmin()) {
    return { sent: false, reason: 'firebase-admin-not-configured' };
  }

  const stringData = Object.entries(data).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null) acc[key] = String(value);
    return acc;
  }, {});

  const response = await getMessaging().send({
    topic,
    notification: { title, body },
    data: stringData,
    android: {
      priority: 'high',
      notification: {
        channelId: 'new_houses',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  });

  return { sent: true, messageId: response };
};

const sendToTokens = async ({ tokens, title, body, data = {} }) => {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { sent: false, successCount: 0, failureCount: 0 };
  }

  if (!initFirebaseAdmin()) {
    return { sent: false, reason: 'firebase-admin-not-configured' };
  }

  const stringData = Object.entries(data).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null) acc[key] = String(value);
    return acc;
  }, {});

  const chunks = [];
  for (let i = 0; i < tokens.length; i += 500) {
    chunks.push(tokens.slice(i, i + 500));
  }

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = [];

  for (const chunk of chunks) {
    const response = await getMessaging().sendEachForMulticast({
      tokens: chunk,
      notification: { title, body },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId: 'new_houses',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    });

    successCount += response.successCount;
    failureCount += response.failureCount;
    response.responses.forEach((item, index) => {
      const code = item.error?.code;
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        invalidTokens.push(chunk[index]);
      }
    });
  }

  return { sent: true, successCount, failureCount, invalidTokens };
};

module.exports = {
  initFirebaseAdmin,
  sendToTopic,
  sendToTokens,
};
