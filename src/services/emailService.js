const nodemailer = require('nodemailer');

// Email configuration validation
const requiredEmailEnvVars = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'SUPPORT_EMAIL',
  'ADMIN_EMAIL'
];

const validateEmailConfig = () => {
  const missing = requiredEmailEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    return false;
  }
  return true;
};

// Create email transporter
const createTransporter = () => {
  if (!validateEmailConfig()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
  });
};

// Email rate limiting using in-memory tracking
const emailRateLimits = new Map();
const EMAIL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between similar emails

const canSendEmail = (email, eventType) => {
  const key = `${email}:${eventType}`;
  const lastSent = emailRateLimits.get(key);
  const now = Date.now();
  
  if (lastSent && (now - lastSent) < EMAIL_COOLDOWN_MS) {
    return false;
  }
  
  emailRateLimits.set(key, now);
  return true;
};

// Security email templates
const emailTemplates = {
  accountLocked: (userName, lockTime, unlockTime) => ({
    subject: 'Account Temporarily Locked - Security Alert',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
          <h1 style="margin: 0;">🔒 Account Locked</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px;">
          <p>Dear ${userName},</p>
          <p>We detected suspicious activity on your account and have temporarily locked it for your protection.</p>
          <p><strong>Lock Time:</strong> ${new Date(lockTime).toLocaleString()}</p>
          <p><strong>Expected Unlock:</strong> ${new Date(unlockTime).toLocaleString()}</p>
          <p>If you did not attempt to log in multiple times, please contact our support team immediately.</p>
          <p>You can regain access after the lockout period expires, or contact support for assistance.</p>
          <div style="margin-top: 30px; padding: 15px; background: #fff; border-left: 4px solid #f44336;">
            <p style="margin: 0;"><strong>What to do:</strong></p>
            <ul style="margin: 10px 0 0 20px;">
              <li>Wait for the lockout to expire (usually 15-30 minutes)</li>
              <li>Contact support if you believe this is an error</li>
              <li>Change your password after regaining access</li>
            </ul>
          </div>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            If you didn't trigger this lockout, please contact support immediately.<br>
            Support: ${process.env.SUPPORT_EMAIL}
          </p>
        </div>
      </div>
    `
  }),

  passwordChanged: (userName, changeTime, deviceInfo) => ({
    subject: 'Password Changed - Security Notification',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
          <h1 style="margin: 0;">🔐 Password Changed</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px;">
          <p>Dear ${userName},</p>
          <p>Your account password was successfully changed.</p>
          <p><strong>Time:</strong> ${new Date(changeTime).toLocaleString()}</p>
          ${deviceInfo ? `<p><strong>Device:</strong> ${deviceInfo}</p>` : ''}
          <p>If you initiated this change, no further action is required.</p>
          <div style="margin-top: 30px; padding: 15px; background: #fff; border-left: 4px solid #4CAF50;">
            <p style="margin: 0;"><strong>Security Tip:</strong></p>
            <ul style="margin: 10px 0 0 20px;">
              <li>Use a strong, unique password</li>
              <li>Enable two-factor authentication if available</li>
              <li>Never share your password with anyone</li>
            </ul>
          </div>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            If you did not change your password, please contact support immediately.<br>
            Support: ${process.env.SUPPORT_EMAIL}
          </p>
        </div>
      </div>
    `
  }),

  passwordResetRequested: (userName, resetTime) => ({
    subject: 'Password Reset Requested - Security Alert',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
          <h1 style="margin: 0;">🔄 Password Reset Requested</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px;">
          <p>Dear ${userName},</p>
          <p>A password reset was requested for your account.</p>
          <p><strong>Time:</strong> ${new Date(resetTime).toLocaleString()}</p>
          <p>If you requested this reset, please follow the instructions in the reset email you should receive shortly.</p>
          <div style="margin-top: 30px; padding: 15px; background: #fff; border-left: 4px solid #2196F3;">
            <p style="margin: 0;"><strong>Important:</strong></p>
            <ul style="margin: 10px 0 0 20px;">
              <li>Password reset links expire after a short time</li>
              <li>Only you can complete the reset using the link</li>
              <li>Contact support if you didn't request this change</li>
            </ul>
          </div>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            If you did not request a password reset, please contact support immediately.<br>
            Support: ${process.env.SUPPORT_EMAIL}
          </p>
        </div>
      </div>
    `
  }),

  passwordResetCompleted: (userName, resetTime) => ({
    subject: 'Password Reset Completed - Security Notification',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
          <h1 style="margin: 0;">✅ Password Reset Completed</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px;">
          <p>Dear ${userName},</p>
          <p>Your password has been successfully reset.</p>
          <p><strong>Time:</strong> ${new Date(resetTime).toLocaleString()}</p>
          <p>You can now log in with your new password.</p>
          <div style="margin-top: 30px; padding: 15px; background: #fff; border-left: 4px solid #4CAF50;">
            <p style="margin: 0;"><strong>Next Steps:</strong></p>
            <ul style="margin: 10px 0 0 20px;">
              <li>Log in with your new password</li>
              <li>Review your account security settings</li>
              <li>Check for any unauthorized activity</li>
            </ul>
          </div>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            If you did not complete this password reset, please contact support immediately.<br>
            Support: ${process.env.SUPPORT_EMAIL}
          </p>
        </div>
      </div>
    `
  }),

  suspiciousLoginActivity: (userName, activityDetails, threshold) => ({
    subject: 'Suspicious Login Activity Detected - Security Alert',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #FF9800; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
          <h1 style="margin: 0;">⚠️ Suspicious Activity Detected</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px;">
          <p>Dear ${userName},</p>
          <p>We detected multiple failed login attempts on your account, which may indicate unauthorized access attempts.</p>
          <p><strong>Failed Attempts:</strong> ${activityDetails.attempts} (threshold: ${threshold})</p>
          <p><strong>First Detected:</strong> ${new Date(activityDetails.firstAttempt).toLocaleString()}</p>
          <p><strong>Last Attempt:</strong> ${new Date(activityDetails.lastAttempt).toLocaleString()}</p>
          ${activityDetails.ip ? `<p><strong>IP Address:</strong> ${activityDetails.ip}</p>` : ''}
          <p>Your account may be temporarily locked if this activity continues.</p>
          <div style="margin-top: 30px; padding: 15px; background: #fff; border-left: 4px solid #FF9800;">
            <p style="margin: 0;"><strong>Recommended Actions:</strong></p>
            <ul style="margin: 10px 0 0 20px;">
              <li>Change your password immediately</li>
              <li>Review your recent account activity</li>
              <li>Contact support if you don't recognize this activity</li>
            </ul>
          </div>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            If these attempts were not from you, please contact support immediately.<br>
            Support: ${process.env.SUPPORT_EMAIL}
          </p>
        </div>
      </div>
    `
  }),

  accountBanned: (userName, banTime, reason) => ({
    subject: 'Account Suspended - Important Notice',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
          <h1 style="margin: 0;">🚫 Account Suspended</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px;">
          <p>Dear ${userName},</p>
          <p>Your account has been suspended by our administration team.</p>
          <p><strong>Suspension Time:</strong> ${new Date(banTime).toLocaleString()}</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>If you believe this suspension is in error, please contact our support team to appeal this decision.</p>
          <div style="margin-top: 30px; padding: 15px; background: #fff; border-left: 4px solid #f44336;">
            <p style="margin: 0;"><strong>Next Steps:</strong></p>
            <ul style="margin: 10px 0 0 20px;">
              <li>Contact support to discuss your account status</li>
              <li>Provide any relevant information for review</li>
              <li>Wait for administrative review</li>
            </ul>
          </div>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            For questions about your account suspension, please contact support.<br>
            Support: ${process.env.SUPPORT_EMAIL}
          </p>
        </div>
      </div>
    `
  })
};

// Send security email
const sendSecurityEmail = async (email, eventType, templateData) => {
  // Check email configuration
  const transporter = createTransporter();
  if (!transporter) {
    return { success: false, reason: 'email_not_configured' };
  }

  // Check rate limiting
  if (!canSendEmail(email, eventType)) {
    return { success: false, reason: 'rate_limited' };
  }

  // Get email template
  const template = emailTemplates[eventType];
  if (!template) {
    return { success: false, reason: 'invalid_event_type' };
  }

  try {
    const { subject, html } = template(templateData);
    
    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: email,
      subject: subject,
      html: html
    };

    const info = await transporter.sendMail(mailOptions);
    
    // Log successful email send (without sensitive data)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Security email sent: ${eventType} to ${email}`);
    }
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    // Log email error without exposing SMTP credentials
    if (process.env.NODE_ENV !== 'production') {
      console.error(`Email send failed: ${eventType} - ${error.message}`);
    }
    return { success: false, reason: 'send_failed' };
  }
};

// Security event types
const SecurityEvents = {
  ACCOUNT_LOCKED: 'accountLocked',
  PASSWORD_CHANGED: 'passwordChanged',
  PASSWORD_RESET_REQUESTED: 'passwordResetRequested',
  PASSWORD_RESET_COMPLETED: 'passwordResetCompleted',
  SUSPICIOUS_LOGIN_ACTIVITY: 'suspiciousLoginActivity',
  ACCOUNT_BANNED: 'accountBanned'
};

module.exports = {
  sendSecurityEmail,
  SecurityEvents,
  validateEmailConfig,
  emailTemplates
};