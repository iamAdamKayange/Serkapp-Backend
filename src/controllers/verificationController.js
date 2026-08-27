const pool = require('../config/db');
const { uploadToSpaces } = require('../services/imageUploadService');

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
      'SELECT id, status, submitted_at, review_count FROM landlord_identity_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1',
      [userId]
    );

    if (existing.rows.length > 0) {
      const existingStatus = existing.rows[0].status;
      const reviewCount = existing.rows[0].review_count || 0;
      const submittedAt = new Date(existing.rows[0].submitted_at);
      const now = new Date();
      const daysSinceSubmission = (now - submittedAt) / (1000 * 60 * 60 * 24);

      if (existingStatus === 'verified') {
        return res.status(400).json({ error: 'Identity already verified' });
      }
      
      if (existingStatus === 'pending') {
        return res.status(400).json({ 
          error: 'Verification already pending review',
          status: 'pending',
          submittedAt: existing.rows[0].submitted_at
        });
      }

      // If rejected, check if they can resubmit (limit to 3 attempts per month)
      if (existingStatus === 'rejected') {
        if (reviewCount >= 3 && daysSinceSubmission < 30) {
          return res.status(429).json({ 
            error: 'Too many verification attempts. Please wait 30 days before trying again.',
            retryAfter: Math.ceil(30 - daysSinceSubmission)
          });
        }
        if (daysSinceSubmission < 7) {
          return res.status(429).json({ 
            error: 'Please wait 7 days before resubmitting verification',
            retryAfter: Math.ceil(7 - daysSinceSubmission)
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
             reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW(), review_count = COALESCE(review_count, 0) + 1
         WHERE user_id = $6::uuid`,
        [fullName, ninNumber, idPhotoUrl, selfieUrl, idDocumentUrl, userId]
      );
    } else {
      // Create new record
      await pool.query(
        `INSERT INTO landlord_identity_verification (user_id, full_name, nin_number, id_photo_url, selfie_photo_url, id_document_url, status, submitted_at, review_count)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, 'pending', NOW(), 1)`,
        [userId, fullName, ninNumber, idPhotoUrl, selfieUrl, idDocumentUrl]
      );
    }

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
      `SELECT id, full_name, nin_number, id_photo_url, selfie_photo_url, id_document_url, status, admin_notes, submitted_at, reviewed_at, review_count
       FROM landlord_identity_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'not_submitted' });
    }

    const verification = result.rows[0];
    const now = new Date();
    const submittedAt = new Date(verification.submitted_at);
    const daysSinceSubmission = (now - submittedAt) / (1000 * 60 * 60 * 24);
    
    // Calculate retry information
    let canResubmit = false;
    let retryAfter = 0;
    let retryReason = '';

    if (verification.status === 'rejected') {
      const reviewCount = verification.review_count || 0;
      if (reviewCount >= 3 && daysSinceSubmission < 30) {
        retryAfter = Math.ceil(30 - daysSinceSubmission);
        retryReason = 'Too many attempts';
      } else if (daysSinceSubmission < 7) {
        retryAfter = Math.ceil(7 - daysSinceSubmission);
        retryReason = 'Wait period';
      } else {
        canResubmit = true;
      }
    }

    res.json({
      ...verification,
      canResubmit,
      retryAfter,
      retryReason,
      daysSinceSubmission: Math.floor(daysSinceSubmission),
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
    if (status === 'rejected') {
      await pool.query(
        `UPDATE landlord_identity_verification 
         SET status = $1, admin_notes = $2, reviewed_at = NOW(), reviewed_by = $3, 
             review_count = COALESCE(review_count, 0) + 1, updated_at = NOW()
         WHERE id = $4`,
        [status, adminNotes || null, adminId, verificationId]
      );
    } else {
      await pool.query(
        `UPDATE landlord_identity_verification 
         SET status = $1, admin_notes = $2, reviewed_at = NOW(), reviewed_by = $3, updated_at = NOW()
         WHERE id = $4`,
        [status, adminNotes || null, adminId, verificationId]
      );
    }

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
      'SELECT id, status FROM landlord_property_verification WHERE user_id = $1::uuid',
      [userId]
    );

    if (existing.rows.length > 0) {
      const existingStatus = existing.rows[0].status;
      if (existingStatus === 'verified') {
        return res.status(400).json({ error: 'Property already verified' });
      }
      if (existingStatus === 'pending') {
        return res.status(400).json({ error: 'Verification already pending review' });
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
             status = 'pending', admin_notes = NULL, submitted_at = NOW(), reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW()
         WHERE user_id = $6::uuid`,
        [documentUrl, photoUrls, latitude, longitude, address, userId]
      );
    } else {
      // Create new record
      await pool.query(
        `INSERT INTO landlord_property_verification (user_id, property_document_url, property_photos, latitude, longitude, address, status, submitted_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, 'pending', NOW())`,
        [userId, documentUrl, photoUrls, latitude, longitude, address]
      );
    }

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
      `SELECT id, property_document_url, property_photos, latitude, longitude, address, status, admin_notes, submitted_at, reviewed_at, review_count
       FROM landlord_property_verification WHERE user_id = $1::uuid ORDER BY submitted_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'not_submitted' });
    }

    const verification = result.rows[0];
    const now = new Date();
    const submittedAt = new Date(verification.submitted_at);
    const daysSinceSubmission = (now - submittedAt) / (1000 * 60 * 60 * 24);
    
    // Calculate retry information
    let canResubmit = false;
    let retryAfter = 0;
    let retryReason = '';

    if (verification.status === 'rejected') {
      const reviewCount = verification.review_count || 0;
      if (reviewCount >= 3 && daysSinceSubmission < 30) {
        retryAfter = Math.ceil(30 - daysSinceSubmission);
        retryReason = 'Too many attempts';
      } else if (daysSinceSubmission < 7) {
        retryAfter = Math.ceil(7 - daysSinceSubmission);
        retryReason = 'Wait period';
      } else {
        canResubmit = true;
      }
    }

    res.json({
      ...verification,
      canResubmit,
      retryAfter,
      retryReason,
      daysSinceSubmission: Math.floor(daysSinceSubmission),
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
    if (status === 'rejected') {
      await pool.query(
        `UPDATE landlord_property_verification 
         SET status = $1, admin_notes = $2, reviewed_at = NOW(), reviewed_by = $3, 
             review_count = COALESCE(review_count, 0) + 1, updated_at = NOW()
         WHERE id = $4`,
        [status, adminNotes || null, adminId, verificationId]
      );
    } else {
      await pool.query(
        `UPDATE landlord_property_verification 
         SET status = $1, admin_notes = $2, reviewed_at = NOW(), reviewed_by = $3, updated_at = NOW()
         WHERE id = $4`,
        [status, adminNotes || null, adminId, verificationId]
      );
    }

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
      `SELECT status FROM landlord_identity_verification WHERE user_id = $1::uuid`,
      [userId]
    );

    const propertyResult = await pool.query(
      `SELECT status FROM landlord_property_verification WHERE user_id = $1::uuid`,
      [userId]
    );

    const identityStatus = identityResult.rows.length > 0 ? identityResult.rows[0].status : 'not_submitted';
    const propertyStatus = propertyResult.rows.length > 0 ? propertyResult.rows[0].status : 'not_submitted';

    const canPublish = identityStatus === 'verified' && propertyStatus === 'verified';

    res.json({
      identityStatus,
      propertyStatus,
      canPublish,
    });
  } catch (err) {
    next(err);
  }
};