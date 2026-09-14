/**
 * Notification Localization Service
 * Provides localized notification strings for Swahili and English
 */

const NOTIFICATION_STRINGS = {
  // Verification notifications
  verification_identity_submitted: {
    sw: {
      title: 'Uthibitishaji wa Identity Uliwasilishwa',
      body: 'Tumepokea ombi lako la uthibitishaji wa identity na linachunguzwa sasa hivi.',
    },
    en: {
      title: 'Identity Verification Submitted',
      body: 'We received your identity verification request and it is now under review.',
    },
  },
  verification_identity_verified: {
    sw: {
      title: 'Identity Imeridhiwa',
      body: 'Identity yako imethibitishwa. Unaweza kuendelea kuchapisha nyumba.',
    },
    en: {
      title: 'Identity Verified',
      body: 'Your identity verification has been approved. You can now continue publishing houses.',
    },
  },
  verification_identity_rejected: {
    sw: {
      title: 'Identity Inakataliwa',
      body: 'Uthibitishaji wa identity umekataliwa. Tafadhali angalia maoni ya admin.',
    },
    en: {
      title: 'Identity Verification Needs Changes',
      body: 'Your identity verification was rejected. Please check admin notes.',
    },
  },
  verification_identity_cancelled: {
    sw: {
      title: 'Uthibitishaji Umefuta',
      body: 'Ombi lako la uthibitishaji limefutwa. Unaweza kuwasilisha tena kama bado una majaribio.',
    },
    en: {
      title: 'Identity Verification Cancelled',
      body: 'Your identity verification request was cancelled. You can submit again if you still have remaining attempts.',
    },
  },
  verification_property_submitted: {
    sw: {
      title: 'Uthibitishaji wa Mali Uliwasilishwa',
      body: 'Tumepokea ombi lako la uthibitishaji wa mali na linachunguzwa sasa hivi.',
    },
    en: {
      title: 'Property Verification Submitted',
      body: 'We received your property verification request and it is now under review.',
    },
  },
  verification_property_verified: {
    sw: {
      title: 'Mali Imeridhiwa',
      body: 'Mali yako imethibitishwa. Unaweza kuchapisha nyumba zako.',
    },
    en: {
      title: 'Property Verified',
      body: 'Your property has been verified. You can now publish your houses.',
    },
  },
  verification_property_rejected: {
    sw: {
      title: 'Mali Inakataliwa',
      body: 'Uthibitishaji wa mali umekataliwa. Tafadhali angalia maoni ya admin.',
    },
    en: {
      title: 'Property Verification Needs Changes',
      body: 'Your property verification was rejected. Please check admin notes.',
    },
  },
  verification_property_cancelled: {
    sw: {
      title: 'Uthibitishaji wa Mali Umefuta',
      body: 'Ombi lako la uthibitishaji wa mali limefutwa.',
    },
    en: {
      title: 'Property Verification Cancelled',
      body: 'Your property verification request was cancelled.',
    },
  },

  // House notifications
  house_created: {
    sw: {
      title: 'Nyumba Mpya Imechapishwa',
      body: 'Nyumba mpya imewekwa kwenye mfumo.',
    },
    en: {
      title: 'New House Created',
      body: 'A new house has been added to the platform.',
    },
  },
  house_updated: {
    sw: {
      title: 'Nyumba Imehaririwa',
      body: 'Maelezo ya nyumba yamebadilishwa.',
    },
    en: {
      title: 'House Updated',
      body: 'House details have been updated.',
    },
  },
  house_deleted: {
    sw: {
      title: 'Nyumba Imefutwa',
      body: 'Nyumba imefutwa kutoka kwenye mfumo.',
    },
    en: {
      title: 'House Deleted',
      body: 'A house has been removed from the platform.',
    },
  },
  house_approved: {
    sw: {
      title: 'Nyumba Imeidhinishwa',
      body: 'Nyumba yako imeidhinishwa na sasa inapatikana kwa watumiaji.',
    },
    en: {
      title: 'House Approved',
      body: 'Your house has been approved and is now visible to users.',
    },
  },
  house_rejected: {
    sw: {
      title: 'Nyumba Inakataliwa',
      body: 'Nyumba yako imekataliwa. Tafadhali angalia maoni ya admin.',
    },
    en: {
      title: 'House Rejected',
      body: 'Your house has been rejected. Please check admin notes.',
    },
  },

  // User notifications
  user_banned: {
    sw: {
      title: 'Akaunti Imefungwa',
      body: 'Akaunti yako imefungwa kutokana na kukiuka sheria.',
    },
    en: {
      title: 'Account Suspended',
      body: 'Your account has been suspended due to policy violations.',
    },
  },
  user_unbanned: {
    sw: {
      title: 'Akaunti Imefunguliwa',
      body: 'Akaunti yako imefunguliwa tena.',
    },
    en: {
      title: 'Account Restored',
      body: 'Your account has been restored.',
    },
  },

  // Security notifications
  security_alert: {
    sw: {
      title: 'Alert ya Usalama',
      body: 'Tumegundua shughuli za kisusi kwenye akaunti yako.',
    },
    en: {
      title: 'Security Alert',
      body: 'We detected suspicious activity on your account.',
    },
  },
  password_changed: {
    sw: {
      title: 'Nenosiri Imebadilishwa',
      body: 'Nenosiri lako limebadilishwa kikamilifu.',
    },
    en: {
      title: 'Password Changed',
      body: 'Your password has been changed successfully.',
    },
  },

  // Payment notifications
  payment_received: {
    sw: {
      title: 'Malipo Yamepokelewa',
      body: 'Tumepokea malipo yako.',
    },
    en: {
      title: 'Payment Received',
      body: 'We have received your payment.',
    },
  },
  payment_failed: {
    sw: {
      title: 'Malipo Imeshindwa',
      body: 'Malipo yako hayajafanikiwa. Tafadhali jaribu tena.',
    },
    en: {
      title: 'Payment Failed',
      body: 'Your payment could not be processed. Please try again.',
    },
  },

  // General notifications
  welcome: {
    sw: {
      title: 'Karibu SERK',
      body: 'Karibu kwenye SERK. Tafuta nyumba salama kwa urahisi.',
    },
    en: {
      title: 'Welcome to SERK',
      body: 'Welcome to SERK. Find safe housing with confidence.',
    },
  },
};

/**
 * Get localized notification strings
 * @param {string} type - Notification type/key
 * @param {string} language - User's preferred language ('sw' or 'en')
 * @returns {object} Object with title and body in the specified language
 */
function getLocalizedNotification(type, language = 'sw') {
  const lang = language === 'en' ? 'en' : 'sw';
  const notification = NOTIFICATION_STRINGS[type];
  
  if (!notification) {
    // Fallback to English if type not found
    return {
      title: type,
      body: '',
    };
  }

  return notification[lang] || notification['sw'] || notification['en'] || {
    title: type,
    body: '',
  };
}

/**
 * Get notification title in specified language
 * @param {string} type - Notification type/key
 * @param {string} language - User's preferred language
 * @returns {string} Localized title
 */
function getNotificationTitle(type, language = 'sw') {
  const localized = getLocalizedNotification(type, language);
  return localized.title;
}

/**
 * Get notification body in specified language
 * @param {string} type - Notification type/key
 * @param {string} language - User's preferred language
 * @returns {string} Localized body
 */
function getNotificationBody(type, language = 'sw') {
  const localized = getLocalizedNotification(type, language);
  return localized.body;
}

module.exports = {
  getLocalizedNotification,
  getNotificationTitle,
  getNotificationBody,
  NOTIFICATION_STRINGS,
};