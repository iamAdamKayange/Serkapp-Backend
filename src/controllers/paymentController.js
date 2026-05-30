const pool = require('../config/db');
const { initiateMpesaPayment } = require('../services/mpesaService');

// @route POST /api/payments/initiate
exports.initiatePayment = async (req, res, next) => {
  const { houseId, agreementId, amount, phoneNumber, paymentFor } = req.body; // paymentFor: 'rent' or 'registration'
  const userId = req.user.id;
  try {
    // Create a payment record
    const paymentResult = await pool.query(
      `INSERT INTO payments (user_id, house_id, agreement_id, amount, status, payment_method)
       VALUES ($1, $2, $3, $4, 'pending', 'M-Pesa') RETURNING id, transaction_id`,
      [userId, houseId || null, agreementId || null, amount]
    );
    const payment = paymentResult.rows[0];
    
    // Call M-Pesa STK push
    const mpesaResponse = await initiateMpesaPayment(phoneNumber, amount, `Serkapp-${paymentFor}`);
    if (mpesaResponse && mpesaResponse.CheckoutRequestID) {
      // Update payment with transaction_id from M-Pesa (usually CheckoutRequestID)
      await pool.query(`UPDATE payments SET transaction_id = $1 WHERE id = $2`, [mpesaResponse.CheckoutRequestID, payment.id]);
      res.json({ message: 'Payment initiated, check your phone', checkoutRequestId: mpesaResponse.CheckoutRequestID });
    } else {
      throw new Error('M-Pesa initiation failed');
    }
  } catch (err) {
    next(err);
  }
};

// @route POST /api/payments/mpesa-callback (webhook from M-Pesa)
exports.mpesaCallback = async (req, res, next) => {
  const { Body } = req.body;
  const { stkCallback } = Body;
  const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;
  try {
    if (ResultCode === 0) {
      await pool.query(
        `UPDATE payments SET status = 'completed', paid_at = NOW() WHERE transaction_id = $1`,
        [CheckoutRequestID]
      );
      // Also update house status if payment was for registration (landlord paying listing fee)
      // Or update rental agreement if rent payment
    } else {
      await pool.query(
        `UPDATE payments SET status = 'failed', metadata = jsonb_set(metadata, '{error}', to_jsonb($2)) WHERE transaction_id = $1`,
        [CheckoutRequestID, ResultDesc]
      );
    }
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/payments/status/:transactionId
exports.getPaymentStatus = async (req, res, next) => {
  const { transactionId } = req.params;
  try {
    const result = await pool.query(`SELECT status, amount, paid_at FROM payments WHERE transaction_id = $1`, [transactionId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
};