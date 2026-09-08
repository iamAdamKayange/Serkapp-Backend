const axios = require('axios');

// Mock function – replace with real M-Pesa API
async function initiateMpesaPayment(phoneNumber, amount, description) {
  // For sandbox, you can return a fake CheckoutRequestID
  // Payment initiation
  // Real implementation would call M-Pesa stkpush endpoint
  return { CheckoutRequestID: `ws_CO_${Date.now()}` };
}

module.exports = { initiateMpesaPayment };