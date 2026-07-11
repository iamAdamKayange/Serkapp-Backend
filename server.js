require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const pool = require('./src/config/db');
const { initSocket } = require('./src/services/socketService');
const { ensureNotificationTables } = require('./src/services/notificationService');

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'SPACES_KEY',
  'SPACES_SECRET',
  'SPACES_ENDPOINT',
  'SPACES_REGION',
  'SPACES_BUCKET',
  'SPACES_CDN'
];

const missingVars = requiredEnvVars.filter(key => !process.env[key]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  process.exit(1);
}

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

initSocket(server);

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.stack);
    process.exit(1);
  } else {
    console.log('✅ Connected to PostgreSQL');
    release();
    ensureNotificationTables()
      .then(() => console.log('Notification tables are ready'))
      .catch((schemaError) => {
        console.error('Notification schema setup failed:', schemaError);
        process.exit(1);
      });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
