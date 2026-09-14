const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: true
  } : false,
});

async function applyMigration() {
  try {
    console.log('🔍 Checking DATABASE_URL...');
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('username:password')) {
      throw new Error('DATABASE_URL is not configured. Please update your .env file with your actual database credentials.');
    }

    console.log('📊 Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');

    // Apply all migrations in order
    const migrationsDir = path.join(__dirname, '../migrations');
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

    console.log('\n✅ All migrations applied successfully!');
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    if (err.message.includes('password authentication failed')) {
      console.error('\n💡 To fix this issue:');
      console.error('1. Open serkapp-backend/.env');
      console.error('2. Update DATABASE_URL with your actual database credentials');
      console.error('3. For Neon: Copy your connection string from Neon dashboard');
      console.error('4. Format: postgresql://user:password@host:port/database');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();