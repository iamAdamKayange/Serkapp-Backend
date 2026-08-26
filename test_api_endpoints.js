// Test script to verify API endpoints for like and comment functionality
const http = require('http');

const API_BASE_URL = 'http://localhost:5000/api';

function testEndpoint(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 5000,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: jsonData
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function testAPIEndpoints() {
  console.log('🔍 Testing API endpoints for like and comment functionality...\n');

  try {
    // Test 1: Get video comments (public endpoint)
    console.log('Test 1: GET /api/comments/video/:videoId');
    try {
      const response = await testEndpoint('GET', '/comments/video/test-video-id');
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
      console.log('✅ Video comments endpoint is accessible\n');
    } catch (error) {
      console.log(`❌ Video comments endpoint failed: ${error.message}\n`);
    }

    // Test 2: Get video like status (public endpoint)
    console.log('Test 2: GET /api/comments/video/:videoId/like-status');
    try {
      const response = await testEndpoint('GET', '/comments/video/test-video-id/like-status');
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
      console.log('✅ Video like status endpoint is accessible\n');
    } catch (error) {
      console.log(`❌ Video like status endpoint failed: ${error.message}\n`);
    }

    // Test 3: Get house comments (public endpoint)
    console.log('Test 3: GET /api/comments/house/:houseId');
    try {
      const response = await testEndpoint('GET', '/comments/house/test-house-id');
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
      console.log('✅ House comments endpoint is accessible\n');
    } catch (error) {
      console.log(`❌ House comments endpoint failed: ${error.message}\n`);
    }

    // Test 4: Create comment (protected endpoint - should fail without auth)
    console.log('Test 4: POST /api/comments (protected - should fail without auth)');
    try {
      const response = await testEndpoint('POST', '/comments', {
        videoId: 'test-video-id',
        houseId: 'test-house-id',
        content: 'Test comment'
      });
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
      if (response.status === 401 || response.status === 403) {
        console.log('✅ Create comment endpoint is properly protected\n');
      } else {
        console.log('⚠️ Create comment endpoint might not be properly protected\n');
      }
    } catch (error) {
      console.log(`❌ Create comment endpoint failed: ${error.message}\n`);
    }

    // Test 5: Toggle video like (protected endpoint - should fail without auth)
    console.log('Test 5: POST /api/comments/video/:videoId/like (protected - should fail without auth)');
    try {
      const response = await testEndpoint('POST', '/comments/video/test-video-id/like');
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
      if (response.status === 401 || response.status === 403) {
        console.log('✅ Toggle video like endpoint is properly protected\n');
      } else {
        console.log('⚠️ Toggle video like endpoint might not be properly protected\n');
      }
    } catch (error) {
      console.log(`❌ Toggle video like endpoint failed: ${error.message}\n`);
    }

    // Test 6: Toggle comment like (protected endpoint - should fail without auth)
    console.log('Test 6: POST /api/comments/:commentId/like (protected - should fail without auth)');
    try {
      const response = await testEndpoint('POST', '/comments/test-comment-id/like');
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
      if (response.status === 401 || response.status === 403) {
        console.log('✅ Toggle comment like endpoint is properly protected\n');
      } else {
        console.log('⚠️ Toggle comment like endpoint might not be properly protected\n');
      }
    } catch (error) {
      console.log(`❌ Toggle comment like endpoint failed: ${error.message}\n`);
    }

    console.log('✅ API endpoints test completed!');
  } catch (error) {
    console.error('❌ API endpoints test failed:', error);
  }
}

// Run the test
testAPIEndpoints();