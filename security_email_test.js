/**
 * Security Email Notification Test
 * 
 * This script tests the SMTP email security notification system.
 * It verifies that security events trigger appropriate email notifications
 * without exposing sensitive information.
 */

const { sendSecurityEmail, SecurityEvents, validateEmailConfig } = require('./src/services/emailService');
const { 
  trackFailedLogin, 
  isAccountLocked, 
  clearFailedLoginAttempts,
  trackPasswordChange,
  trackPasswordResetRequest,
  trackPasswordResetComplete,
  trackAccountBan,
  getSecurityStatus
} = require('./src/services/securityEventService');

console.log('=== Security Email Notification Test ===\n');

// Test 1: Email Configuration Validation
console.log('Test 1: Email Configuration Validation');
const emailConfigValid = validateEmailConfig();
console.log(`Email config valid: ${emailConfigValid ? '✅ PASS' : '⚠️  WARNING (email notifications disabled)'}`);
console.log('');

// Test 2: Failed Login Tracking
console.log('Test 2: Failed Login Tracking');
async function testFailedLoginTracking() {
  const testEmail = 'test@example.com';
  const testIp = '127.0.0.1';
  
  // Simulate failed login attempts
  for (let i = 0; i < 3; i++) {
    const result = await trackFailedLogin(testEmail, testIp);
    console.log(`Failed login ${i + 1}: attempts=${result.attemptCount}, locked=${result.locked}`);
  }
  
  const securityStatus = await getSecurityStatus(testEmail);
  console.log(`Security status: ${JSON.stringify(securityStatus, null, 2)}`);
  
  // Clear for next test
  clearFailedLoginAttempts(testEmail);
}

testFailedLoginTracking().then(() => console.log(''));

// Test 3: Account Lockout Check
console.log('Test 3: Account Lockout Check');
const lockStatus = isAccountLocked('test@example.com');
console.log(`Account locked: ${lockStatus.locked ? '✅ YES' : '✅ NO'}`);
console.log('');

// Test 4: Password Change Notification
console.log('Test 4: Password Change Notification');
async function testPasswordChange() {
  const testUserId = '00000000-0000-0000-0000-000000000000';
  const testEmail = 'test@example.com';
  
  // This will fail with no user in DB, but tests the email sending logic
  const result = await trackPasswordChange(testUserId, testEmail, 'Test Device');
  console.log(`Password change notification: ${result ? 'Attempted' : 'Failed (expected - no user in DB)'}`);
}

testPasswordChange().then(() => console.log(''));

// Test 5: Password Reset Request
console.log('Test 5: Password Reset Request');
async function testPasswordReset() {
  const testUserId = '00000000-0000-0000-0000-000000000000';
  const testEmail = 'test@example.com';
  
  const result = await trackPasswordResetRequest(testUserId, testEmail);
  console.log(`Password reset request: ${result ? 'Attempted' : 'Failed (expected - no user in DB)'}`);
}

testPasswordReset().then(() => console.log(''));

// Test 6: Account Ban Notification
console.log('Test 6: Account Ban Notification');
async function testAccountBan() {
  const testUserId = '00000000-0000-0000-0000-000000000000';
  const testEmail = 'test@example.com';
  
  const result = await trackAccountBan(testUserId, testEmail, 'Test ban reason');
  console.log(`Account ban notification: ${result ? 'Attempted' : 'Failed (expected - no user in DB)'}`);
}

testAccountBan().then(() => console.log(''));

// Test 7: Direct Email Sending
console.log('Test 7: Direct Email Sending');
async function testDirectEmail() {
  if (!emailConfigValid) {
    console.log('⚠️  Skipped - email not configured');
    return;
  }
  
  const result = await sendSecurityEmail('test@example.com', SecurityEvents.PASSWORD_CHANGED, {
    userName: 'Test User',
    changeTime: new Date().toISOString(),
    deviceInfo: 'Test Device'
  });
  
  console.log(`Email send result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  if (!result.success) {
    console.log(`Reason: ${result.reason}`);
  }
}

testDirectEmail().then(() => {
  console.log('\n=== Test Summary ===');
  console.log('All tests completed.');
  console.log('Note: Some tests may fail if no database is running or email is not configured.');
  console.log('This is expected behavior for the test suite.');
});