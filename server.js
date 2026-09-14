require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const pool = require('./src/config/db');
const { initSocket } = require('./src/services/socketService');
const { ensureNotificationTables } = require('./src/services/notificationService');
const { validateEmailConfig } = require('./src/services/emailService');
const { initializeSecurityTables } = require('./src/services/auditLogService');
const fs = require('fs');
const path = require('path');

// Auto-run database migrations on startup
async function runMigrations() {
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️  No migrations directory found, skipping migrations');
      return;
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📋 Found ${migrationFiles.length} migration file(s)`);

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const migration = fs.readFileSync(filePath, 'utf8');
      
      console.log(`⚙️  Applying migration: ${file}...`);
      await pool.query(migration);
      console.log(`✅ Migration applied: ${file}`);
    }

    console.log('✅ All migrations applied successfully!');
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log('⚠️  Migration columns already exist, continuing...');
    } else {
      console.error('❌ Migration failed:', err.message);
      // Don't exit on migration failure, just log it
    }
  }
}

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

// Validate email configuration (optional - log warning if missing)
if (!validateEmailConfig()) {
  console.warn('⚠️  Email configuration not found. Security email notifications will be disabled.');
} else {
  console.log('✅ Email configuration validated');
}

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

initSocket(server);

pool.connect(async (err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.stack);
    process.exit(1);
  } else {
    console.log('✅ Connected to PostgreSQL');
    release();
    
    // Run migrations first
    await runMigrations();
    
    // Initialize notification tables
    ensureNotificationTables()
      .then(() => console.log('✅ Notification tables are ready'))
      .catch((schemaError) => {
        console.error('Notification schema setup failed:', schemaError);
        process.exit(1);
      });
    
    // Initialize security tables
    initializeSecurityTables()
      .then(() => console.log('✅ Security tables are ready'))
      .catch((schemaError) => {
        console.error('⚠️  Failed to ensure security tables:', schemaError.message);
      });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
