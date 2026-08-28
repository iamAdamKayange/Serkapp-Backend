const pool = require('../config/db');
const { uploadToSpaces } = require('../services/imageUploadService');
const {
  insertNotificationRecord,
  sendNotificationToRoles,
  sendNotificationToUser,
} = require('../services/notificationService');

const MAX_CANCELS = 3;
const RESUBMIT_WAIT_DAYS = 7;
const REVIEW_LIMIT_DAYS = 30;

const dayDiff = (fromDate) =>
  (new Date() - new Date(fromDate)) / (1000 * 60 * 60 * 24);

const computeRequestState = (verification) => {
  if (!verification) {
    return {
      canSubmit: true,
      canCancel: false,
      canResubmit: false,
      cancelCount: 0,
      remainingCancels: MAX_CANCELS,
    };
  }

  const cancelCount = verification.cancel_count || 0;
  const reviewCount = verification.review_count || 0;
  const daysSinceSubmission = verification.submitted_at
    ? dayDiff(verification.submitted_at)
    : 0;

  const canCancel = verification.status === 'pending' && cancelCount < MAX_CANCELS;
  const canResubmit =
    ['rejected', 'cancelled', 'not_submitted'].includes(verification.status) &&
    cancelCount < MAX_CANCELS &&
    (
      verification.status !== 'rejected' ||
      (reviewCount < 3 ? daysSinceSubmission >= RESUBMIT_WAIT_DAYS : daysSinceSubmission >= REVIEW_LIMIT_DAYS)
    );

  return {
    canSubmit:
      ['not_submitted', 'rejected', 'cancelled'].includes(verification.status) &&
      cancelCount < MAX_CANCELS,
    canCancel,
    canResubmit,
    cancelCount,
    remainingCancels: Math.max(MAX_CANCELS - cancelCount, 0),
    daysSinceSubmission: Math.floor(daysSinceSubmission),
  };
};

const notifyVerificationUser = async ({
  userId,
  userRole = 'landlord',
  type,
  title,
  body,
  scope,
  status,
  adminNotes = null,
}) => {
  const data = {
    notificationType: 'verification',
    scope,
    status,
    adminNotes,
    type,
  };

  await insertNotificationRecord({
    type,
    title,
    body,
    data,
    targetUserId: userId,
    targetRoles: [userRole],
  });

  await sendNotificationToUser({
    userId,
    title,
    body,
    data,
    type,
  });
};

// ==================== IDENTITY VERIFICATION ====================

// Submit identity verification
exports.submitIdentityVerification = async (req, res, next) => {
  const userId = req.user.id;
  const { fullName, ninNumber } = req.body;
  
  // Files from multer
  const idPhoto = req.files?.idPhoto?.[0];
  const selfie = req.files?.selfie?.[0];
  const idDocument = req.files?.idDocument?.[0]; // Optional PDF/DOC

  if (!fullName || !ninNumber || !idPhoto || !selfie) {
    return res.status(400).json({ error: 'Full name, NIN number, ID photo and selfie are required' });
  }

  try {
    // Check if user already has verification
    const existing = await pool.query(
      'SELECT id, status, submitted_at, review_count, cancel_count FROM landlord_identity_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1',
      [userId]
    );

    if (existing.rows.length > 0) {
      const existingStatus = existing.rows[0].status;
      const reviewCount = existing.rows[0].review_count || 0;
      const cancelCount = existing.rows[0].cancel_count || 0;
      const submittedAt = new Date(existing.rows[0].submitted_at);
      const daysSinceSubmission = dayDiff(submittedAt);

      if (existingStatus === 'verified') {
        return res.status(400).json({ error: 'Identity already verified' });
      }
      
      if (existingStatus === 'pending') {
        return res.status(400).json({ 
          error: 'Verification already pending review',
          status: 'pending',
          submittedAt: existing.rows[0].submitted_at,
          canCancel: cancelCount < MAX_CANCELS,
          remainingCancels: Math.max(MAX_CANCELS - cancelCount, 0)
        });
      }

      if (existingStatus === 'cancelled' && cancelCount >= MAX_CANCELS) {
        return res.status(429).json({
          error: 'You have reached the maximum cancellation limit for identity verification.',
          canSubmit: false,
          cancelCount,
        });
      }

      // If rejected, check if they can resubmit (limit to 3 attempts per month)
      if (existingStatus === 'rejected') {
        if (reviewCount >= 3 && daysSinceSubmission < REVIEW_LIMIT_DAYS) {
          return res.status(429).json({ 
            error: 'Too many verification attempts. Please wait 30 days before trying again.',
            retryAfter: Math.ceil(REVIEW_LIMIT_DAYS - daysSinceSubmission)
          });
        }
        if (daysSinceSubmission < RESUBMIT_WAIT_DAYS) {
          return res.status(429).json({ 
            error: 'Please wait 7 days before resubmitting verification',
            retryAfter: Math.ceil(RESUBMIT_WAIT_DAYS - daysSinceSubmission)
          });
        }
      }
    }

    // Convert buffer to base64 for upload
    const idPhotoBase64 = idPhoto.buffer.toString('base64');
    const selfieBase64 = selfie.buffer.toString('base64');
    
    // Upload images to Spaces
    const idPhotoUrl = await uploadToSpaces(idPhotoBase64, 'identity-verification');
    const selfieUrl = await uploadToSpaces(selfieBase64, 'identity-verification');
    
    // Upload optional ID document (PDF/DOC)
    let idDocumentUrl = null;
    if (idDocument) {
      const idDocumentBase64 = idDocument.buffer.toString('base64');
      idDocumentUrl = await uploadToSpaces(idDocumentBase64, 'identity-verification-docs');
    }

    if (existing.rows.length > 0) {
      // Update existing record
      await pool.query(
        `UPDATE landlord_identity_verification 
         SET full_name = $1, nin_number = $2, id_photo_url = $3, selfie_photo_url = $4, 
             id_document_url = $5, status = 'pending', admin_notes = NULL, submitted_at = NOW(), 
             reviewed_at = NULL, reviewed_by = NULL, cancelled_at = NULL, updated_at = NOW()
         WHERE user_id = $6::uuid`,
        [fullName, ninNumber, idPhotoUrl, selfieUrl, idDocumentUrl, userId]
      );
    } else {
      // Create new record
      await pool.query(
        `INSERT INTO landlord_identity_verification (user_id, full_name, nin_number, id_photo_url, selfie_photo_url, id_document_url, status, submitted_at, review_count, cancel_count)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, 'pending', NOW(), 0, 0)`,
        [userId, fullName, ninNumber, idPhotoUrl, selfieUrl, idDocumentUrl]
      );
    }

    await Promise.all([
      notifyVerificationUser({
        userId,
        userRole: req.user.role || 'landlord',
        type: 'verification_identity_submitted',
        title: 'Identity verification submitted',
        body: 'We received your identity verification request and it is now under review.',
        scope: 'identity',
        status: 'pending',
      }),
      insertNotificationRecord({
        type: 'verification_identity_submitted',
        title: 'New identity verification request',
        body: `${fullName} submitted a landlord identity verification request.`,
        data: {
          notificationType: 'verification',
          scope: 'identity',
          status: 'pending',
          userId,
          fullName,
        },
        targetRoles: ['admin'],
      }).then((record) =>
        sendNotificationToRoles({
          roles: ['admin'],
          title: record.title,
          body: record.body,
          data: record.data || {},
          type: record.type,
        }),
      ),
    ]);

    res.status(201).json({ message: 'Identity verification submitted successfully' });
  } catch (err) {
    console.error('Submit identity verification error:', err);
    next(err);
  }
};

// Get identity verification status
exports.getIdentityVerificationStatus = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT id, full_name, nin_number, id_photo_url, selfie_photo_url, id_document_url, status, admin_notes, submitted_at, reviewed_at, review_count, cancel_count, cancelled_at
       FROM landlord_identity_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        status: 'not_submitted',
        ...computeRequestState({ status: 'not_submitted', cancel_count: 0, review_count: 0 }),
      });
    }

    const verification = result.rows[0];
    const state = computeRequestState(verification);
    res.json({ ...verification, ...state });
  } catch (err) {
    next(err);
  }
};

// Cancel identity verification request
exports.cancelIdentityVerification = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT id, status, cancel_count FROM landlord_identity_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No identity verification request found' });
    }

    const verification = result.rows[0];
    const cancelCount = verification.cancel_count || 0;

    if (verification.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    }

    if (cancelCount >= MAX_CANCELS) {
      return res.status(429).json({
        error: 'You have reached the maximum cancellation limit.',
        cancelCount,
        remainingCancels: 0,
      });
    }

    await pool.query(
      `UPDATE landlord_identity_verification
       SET status = 'cancelled', cancelled_at = NOW(), admin_notes = NULL, reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW(), cancel_count = COALESCE(cancel_count, 0) + 1
       WHERE id = $1`,
      [verification.id]
    );

    await notifyVerificationUser({
      userId,
      userRole: 'landlord',
      type: 'verification_identity_cancelled',
      title: 'Identity verification cancelled',
      body: 'Your identity verification request was cancelled. You can submit again if you still have remaining attempts.',
      scope: 'identity',
      status: 'cancelled',
    });

    res.json({
      message: 'Identity verification cancelled successfully',
      cancelCount: cancelCount + 1,
      remainingCancels: Math.max(MAX_CANCELS - (cancelCount + 1), 0),
    });
  } catch (err) {
    next(err);
  }
};

// Admin: Get all identity verifications
exports.getPendingIdentityVerifications = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT liv.id, liv.user_id, liv.full_name, liv.nin_number, liv.id_photo_url, liv.selfie_photo_url, liv.id_document_url,
              liv.status, liv.admin_notes, liv.submitted_at, liv.reviewed_at, liv.reviewed_by,
              u.email, u.phone
       FROM landlord_identity_verification liv
       JOIN users u ON liv.user_id = u.id
       ORDER BY liv.submitted_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// Admin: Review identity verification
exports.reviewIdentityVerification = async (req, res, next) => {
  const { verificationId } = req.params;
  const { status, adminNotes } = req.body; // status: 'verified' or 'rejected'
  const adminId = req.user.id;

  if (!['verified', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // When rejecting, increment the review count
    let updated;
    if (status === 'rejected') {
      updated = await pool.query(
        `UPDATE landlord_identity_verification 
         SET status = $1, admin_notes = $2, reviewed_at = NOW(), reviewed_by = $3, 
             review_count = COALESCE(review_count, 0) + 1, updated_at = NOW()
         WHERE id = $4
         RETURNING user_id, full_name, admin_notes`,
        [status, adminNotes || null, adminId, verificationId]
      );
    } else {
      updated = await pool.query(
        `UPDATE landlord_identity_verification 
         SET status = $1, admin_notes = $2, reviewed_at = NOW(), reviewed_by = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING user_id, full_name, admin_notes`,
        [status, adminNotes || null, adminId, verificationId]
      );
    }

    const verification = updated.rows[0];
    await notifyVerificationUser({
      userId: verification.user_id,
      userRole: 'landlord',
      type: `verification_identity_${status}`,
      title: status === 'verified'
        ? 'Identity verification approved'
        : 'Identity verification needs changes',
      body: status === 'verified'
        ? 'Your identity verification has been approved. You can now continue publishing houses.'
        : `Your identity verification was rejected.${adminNotes ? ` Notes: ${adminNotes}` : ''}`,
      scope: 'identity',
      status,
      adminNotes: adminNotes || null,
    });

    res.json({ message: `Identity verification ${status} successfully` });
  } catch (err) {
    next(err);
  }
};

// ==================== PROPERTY VERIFICATION ====================

// Submit property verification
exports.submitPropertyVerification = async (req, res, next) => {
  const userId = req.user.id;
  const { latitude, longitude, address } = req.body;
  
  // Files from multer
  const propertyDocument = req.files?.propertyDocument?.[0];
  const propertyPhotos = req.files?.propertyPhotos || [];

  if (!propertyDocument || !propertyPhotos || propertyPhotos.length === 0) {
    return res.status(400).json({ error: 'Property document and photos are required' });
  }

  try {
    // Check if user already has verification
    const existing = await pool.query(
      'SELECT id, status, submitted_at, review_count, cancel_count FROM landlord_property_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1',
      [userId]
    );

    if (existing.rows.length > 0) {
      const existingStatus = existing.rows[0].status;
      const cancelCount = existing.rows[0].cancel_count || 0;
      const reviewCount = existing.rows[0].review_count || 0;
      const daysSinceSubmission = existing.rows[0].submitted_at
        ? dayDiff(existing.rows[0].submitted_at)
        : 0;
      if (existingStatus === 'verified') {
        return res.status(400).json({ error: 'Property already verified' });
      }
      if (existingStatus === 'pending') {
        return res.status(400).json({
          error: 'Verification already pending review',
          status: 'pending',
          canCancel: cancelCount < MAX_CANCELS,
          remainingCancels: Math.max(MAX_CANCELS - cancelCount, 0),
        });
      }

      if (existingStatus === 'cancelled' && cancelCount >= MAX_CANCELS) {
        return res.status(429).json({
          error: 'You have reached the maximum cancellation limit for property verification.',
          canSubmit: false,
          cancelCount,
        });
      }

      if (existingStatus === 'rejected') {
        if (reviewCount >= 3 && daysSinceSubmission < REVIEW_LIMIT_DAYS) {
          return res.status(429).json({
            error: 'Too many verification attempts. Please wait 30 days before trying again.',
            retryAfter: Math.ceil(REVIEW_LIMIT_DAYS - daysSinceSubmission),
          });
        }
        if (daysSinceSubmission < RESUBMIT_WAIT_DAYS) {
          return res.status(429).json({
            error: 'Please wait 7 days before resubmitting verification',
            retryAfter: Math.ceil(RESUBMIT_WAIT_DAYS - daysSinceSubmission),
          });
        }
      }
    }

    // Convert buffer to base64 for upload
    const documentBase64 = propertyDocument.buffer.toString('base64');
    const photoBase64Array = propertyPhotos.map(photo => photo.buffer.toString('base64'));

    // Upload document and photos to Spaces
    const documentUrl = await uploadToSpaces(documentBase64, 'property-verification');
    const photoUrls = await Promise.all(
      photoBase64Array.map(photoBase64 => uploadToSpaces(photoBase64, 'property-verification'))
    );

    if (existing.rows.length > 0) {
      // Update existing record
      await pool.query(
        `UPDATE landlord_property_verification 
         SET property_document_url = $1, property_photos = $2, latitude = $3, longitude = $4, address = $5,
             status = 'pending', admin_notes = NULL, submitted_at = NOW(), reviewed_at = NULL, reviewed_by = NULL, cancelled_at = NULL, updated_at = NOW()
         WHERE user_id = $6::uuid`,
        [documentUrl, photoUrls, latitude, longitude, address, userId]
      );
    } else {
      // Create new record
      await pool.query(
        `INSERT INTO landlord_property_verification (user_id, property_document_url, property_photos, latitude, longitude, address, status, submitted_at, review_count, cancel_count)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, 'pending', NOW(), 0, 0)`,
        [userId, documentUrl, photoUrls, latitude, longitude, address]
      );
    }

    await Promise.all([
      notifyVerificationUser({
        userId,
        userRole: req.user.role || 'landlord',
        type: 'verification_property_submitted',
        title: 'Property verification submitted',
        body: 'We received your property verification request and it is now under review.',
        scope: 'property',
        status: 'pending',
      }),
      insertNotificationRecord({
        type: 'verification_property_submitted',
        title: 'New property verification request',
        body: `A landlord submitted a property verification request for ${address || 'their property'}.`,
        data: {
          notificationType: 'verification',
          scope: 'property',
          status: 'pending',
          userId,
          address,
        },
        targetRoles: ['admin'],
      }).then((record) =>
        sendNotificationToRoles({
          roles: ['admin'],
          title: record.title,
          body: record.body,
          data: record.data || {},
          type: record.type,
        }),
      ),
    ]);

    res.status(201).json({ message: 'Property verification submitted successfully' });
  } catch (err) {
    console.error('Submit property verification error:', err);
    next(err);
  }
};

// Get property verification status
exports.getPropertyVerificationStatus = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT id, property_document_url, property_photos, latitude, longitude, address, status, admin_notes, submitted_at, reviewed_at, review_count, cancel_count, cancelled_at
       FROM landlord_property_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        status: 'not_submitted',
        ...computeRequestState({ status: 'not_submitted', cancel_count: 0, review_count: 0 }),
      });
    }

    const verification = result.rows[0];
    const state = computeRequestState(verification);
    res.json({ ...verification, ...state });
  } catch (err) {
    next(err);
  }
};

// Cancel property verification request
exports.cancelPropertyVerification = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT id, status, cancel_count FROM landlord_property_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No property verification request found' });
    }

    const verification = result.rows[0];
    const cancelCount = verification.cancel_count || 0;

    if (verification.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    }

    if (cancelCount >= MAX_CANCELS) {
      return res.status(429).json({
        error: 'You have reached the maximum cancellation limit.',
        cancelCount,
        remainingCancels: 0,
      });
    }

    await pool.query(
      `UPDATE landlord_property_verification
       SET status = 'cancelled', cancelled_at = NOW(), admin_notes = NULL, reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW(), cancel_count = COALESCE(cancel_count, 0) + 1
       WHERE id = $1`,
      [verification.id]
    );

    await notifyVerificationUser({
      userId,
      userRole: 'landlord',
      type: 'verification_property_cancelled',
      title: 'Property verification cancelled',
      body: 'Your property verification request was cancelled. You can submit again if you still have remaining attempts.',
      scope: 'property',
      status: 'cancelled',
    });

    res.json({
      message: 'Property verification cancelled successfully',
      cancelCount: cancelCount + 1,
      remainingCancels: Math.max(MAX_CANCELS - (cancelCount + 1), 0),
    });
  } catch (err) {
    next(err);
  }
};

// Cancel any active verification requests for the landlord
exports.cancelAllVerificationRequests = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const [identityResult, propertyResult] = await Promise.all([
      pool.query(
        `SELECT id, status, cancel_count FROM landlord_identity_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1`,
        [userId]
      ),
      pool.query(
        `SELECT id, status, cancel_count FROM landlord_property_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1`,
        [userId]
      ),
    ]);

    const updates = [];

    if (identityResult.rows[0]?.status === 'pending' && (identityResult.rows[0].cancel_count || 0) < MAX_CANCELS) {
      updates.push(
        pool.query(
          `UPDATE landlord_identity_verification
           SET status = 'cancelled', cancelled_at = NOW(), admin_notes = NULL, reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW(), cancel_count = COALESCE(cancel_count, 0) + 1
           WHERE id = $1`,
          [identityResult.rows[0].id]
        )
      );
    }

    if (propertyResult.rows[0]?.status === 'pending' && (propertyResult.rows[0].cancel_count || 0) < MAX_CANCELS) {
      updates.push(
        pool.query(
          `UPDATE landlord_property_verification
           SET status = 'cancelled', cancelled_at = NOW(), admin_notes = NULL, reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW(), cancel_count = COALESCE(cancel_count, 0) + 1
           WHERE id = $1`,
          [propertyResult.rows[0].id]
        )
      );
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No pending verification request found to cancel' });
    }

    await Promise.all(updates);

    res.json({
      message: 'Verification request cancelled successfully',
      identityCancelled: identityResult.rows[0]?.status === 'pending',
      propertyCancelled: propertyResult.rows[0]?.status === 'pending',
    });
  } catch (err) {
    next(err);
  }
};

// Admin: Get all property verifications
exports.getPendingPropertyVerifications = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT lpv.id, lpv.user_id, lpv.property_document_url, lpv.property_photos, lpv.latitude, lpv.longitude, lpv.address,
              lpv.status, lpv.admin_notes, lpv.submitted_at, lpv.reviewed_at, lpv.reviewed_by,
              u.email, u.phone
       FROM landlord_property_verification lpv
       JOIN users u ON lpv.user_id = u.id
       ORDER BY lpv.submitted_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// Admin: Review property verification
exports.reviewPropertyVerification = async (req, res, next) => {
  const { verificationId } = req.params;
  const { status, adminNotes } = req.body; // status: 'verified' or 'rejected'
  const adminId = req.user.id;

  if (!['verified', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // When rejecting, increment the review count
    let updated;
    if (status === 'rejected') {
      updated = await pool.query(
        `UPDATE landlord_property_verification 
         SET status = $1, admin_notes = $2, reviewed_at = NOW(), reviewed_by = $3, 
             review_count = COALESCE(review_count, 0) + 1, updated_at = NOW()
         WHERE id = $4
         RETURNING user_id, address, admin_notes`,
        [status, adminNotes || null, adminId, verificationId]
      );
    } else {
      updated = await pool.query(
        `UPDATE landlord_property_verification 
         SET status = $1, admin_notes = $2, reviewed_at = NOW(), reviewed_by = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING user_id, address, admin_notes`,
        [status, adminNotes || null, adminId, verificationId]
      );
    }

    const verification = updated.rows[0];
    await notifyVerificationUser({
      userId: verification.user_id,
      userRole: 'landlord',
      type: `verification_property_${status}`,
      title: status === 'verified'
        ? 'Property verification approved'
        : 'Property verification needs changes',
      body: status === 'verified'
        ? 'Your property verification has been approved. You can now continue publishing houses.'
        : `Your property verification was rejected.${adminNotes ? ` Notes: ${adminNotes}` : ''}`,
      scope: 'property',
      status,
      adminNotes: adminNotes || null,
    });

    res.json({ message: `Property verification ${status} successfully` });
  } catch (err) {
    next(err);
  }
};

// ==================== COMBINED VERIFICATION STATUS ====================

// Get overall verification status for landlord
exports.getVerificationStatus = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const identityResult = await pool.query(
      `SELECT status, submitted_at, review_count, cancel_count FROM landlord_identity_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1`,
      [userId]
    );

    const propertyResult = await pool.query(
      `SELECT status, submitted_at, review_count, cancel_count FROM landlord_property_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1`,
      [userId]
    );

    const identityStatus = identityResult.rows.length > 0 ? identityResult.rows[0].status : 'not_submitted';
    const propertyStatus = propertyResult.rows.length > 0 ? propertyResult.rows[0].status : 'not_submitted';
    const identityState = computeRequestState(identityResult.rows[0] || { status: 'not_submitted', review_count: 0, cancel_count: 0 });
    const propertyState = computeRequestState(propertyResult.rows[0] || { status: 'not_submitted', review_count: 0, cancel_count: 0 });

    const canPublish = identityStatus === 'verified' && propertyStatus === 'verified';

    res.json({
      identityStatus,
      propertyStatus,
      canPublish,
      identity: identityResult.rows[0] || null,
      property: propertyResult.rows[0] || null,
      identityState,
      propertyState,
    });
  } catch (err) {
    next(err);
  }
};
