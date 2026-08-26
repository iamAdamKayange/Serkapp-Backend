// Test script to verify like and comment functionality
const pool = require('./src/config/db');

async function testDatabaseStructure() {
  console.log('🔍 Testing database structure for like and comment tables...\n');

  try {
    // Check if video_comments table exists
    const videoCommentsCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'video_comments'
      )
    `);
    console.log(`✅ video_comments table exists: ${videoCommentsCheck.rows[0].exists}`);

    // Check if video_likes table exists
    const videoLikesCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'video_likes'
      )
    `);
    console.log(`✅ video_likes table exists: ${videoLikesCheck.rows[0].exists}`);

    // Check if comment_likes table exists
    const commentLikesCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'comment_likes'
      )
    `);
    console.log(`✅ comment_likes table exists: ${commentLikesCheck.rows[0].exists}`);

    // Check video_comments structure
    if (videoCommentsCheck.rows[0].exists) {
      const videoCommentsStructure = await pool.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'video_comments'
        ORDER BY ordinal_position
      `);
      console.log('\n📋 video_comments structure:');
      videoCommentsStructure.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    }

    // Check video_likes structure
    if (videoLikesCheck.rows[0].exists) {
      const videoLikesStructure = await pool.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'video_likes'
        ORDER BY ordinal_position
      `);
      console.log('\n📋 video_likes structure:');
      videoLikesStructure.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    }

    // Check comment_likes structure
    if (commentLikesCheck.rows[0].exists) {
      const commentLikesStructure = await pool.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'comment_likes'
        ORDER BY ordinal_position
      `);
      console.log('\n📋 comment_likes structure:');
      commentLikesStructure.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    }

    // Check if indexes exist
    const indexCheck = await pool.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE tablename IN ('video_comments', 'video_likes', 'comment_likes')
      ORDER BY tablename, indexname
    `);
    console.log('\n📊 Indexes found:');
    indexCheck.rows.forEach(idx => {
      console.log(`  - ${idx.tablename}: ${idx.indexname}`);
    });

    console.log('\n✅ Database structure test completed successfully!');
  } catch (error) {
    console.error('❌ Database structure test failed:', error);
  } finally {
    await pool.end();
  }
}

// Run the test
testDatabaseStructure();