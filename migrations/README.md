# Database Migrations

## Apply All Migrations

To apply all pending migrations:

```bash
node scripts/apply-migration.js
```

## Available Migrations

### 1. Add Preferred Language
- **File:** `add_preferred_language.sql`
- **Description:** Adds `preferred_language` column to the users table to support bilingual notifications (Swahili/English)
- **Default Value:** `sw` (Swahili)
- **Impact:** Enables backend notifications to respect user's language preference

**Manual SQL** (if needed):
```sql
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) NOT NULL DEFAULT 'sw';

ALTER TABLE users 
ADD CONSTRAINT chk_preferred_language 
CHECK (preferred_language IN ('sw', 'en'));

CREATE INDEX IF NOT EXISTS idx_users_preferred_language 
ON users (preferred_language);

COMMENT ON COLUMN users.preferred_language IS 'User preferred language: sw (Kiswahili) or en (English)';
```

### 2. Add House Rejection Reason
- **File:** `add_house_rejection_reason.sql`
- **Description:** Adds `rejection_reason` column to the `houses` table to store admin's reason when rejecting a house
- **Impact:** Enables landlords to see why their house was rejected and what needs to be corrected

**Manual SQL** (if needed):
```sql
ALTER TABLE houses
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN houses.rejection_reason IS 'Reason provided by admin when rejecting a house listing';
```

## Important Notes

- Always backup your database before applying migrations
- Test migrations in a development environment first
- The migration script is idempotent - it can be run multiple times safely
- The `IF NOT EXISTS` clause ensures columns are only added if they don't exist