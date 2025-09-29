const PayOS = require("@payos/node");

let payOS;

try {
  payOS = new PayOS(
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY
  );
  console.log("PayOS instance created successfully.");
} catch (error) {
  console.error("PayOS initialization error:", error);
  console.error("Make sure PayOS environment variables are set correctly");
  process.exit(1);
}

/**
 * Create a payment link for premium subscription
 * @param {Object} paymentData - Payment data object
 * @param {number} paymentData.orderCode - Unique order code
 * @param {number} paymentData.amount - Payment amount
 * @param {string} paymentData.description - Payment description
 * @param {Array} paymentData.items - Payment items
 * @param {string} paymentData.returnUrl - Return URL after payment
 * @param {string} paymentData.cancelUrl - Cancel URL
 * @returns {Promise<Object>} Payment link response
 */
const createPaymentLink = async (paymentData) => {
  try {
    // PayOS v1.x uses createPaymentLink()
    const response = await payOS.createPaymentLink(paymentData);
    return response;
  } catch (error) {
    console.error("Error creating PayOS payment link:", error);
    throw error;
  }
};

/**
 * Get payment information by order code
 * @param {string} orderCode - Order code to get payment info
 * @returns {Promise<Object>} Payment information
 */
const getPaymentLinkInformation = async (orderCode) => {
  try {
    // PayOS v1.x uses getPaymentLinkInformation()
    const response = await payOS.getPaymentLinkInformation(orderCode);
    return response;
  } catch (error) {
    console.error("Error getting PayOS payment info:", error);
    throw error;
  }
};

/**
 * Verify webhook data from PayOS
 * @param {Object} webhookData - Webhook data from PayOS
 * @returns {boolean} True if webhook is valid
 */
const verifyPaymentWebhookData = (webhookData) => {
  try {
    // PayOS v1.x webhook verification
    return payOS.verifyPaymentWebhookData(webhookData);
  } catch (error) {
    console.error("Error verifying PayOS webhook:", error);
    return false;
  }
};

module.exports = {
  createPaymentLink,
  getPaymentLinkInformation,
  verifyPaymentWebhookData,
  payOS,
};
