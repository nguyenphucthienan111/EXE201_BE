const express = require("express");
const router = express.Router();
const Payment = require("../models/Payment");
const authenticateToken = require("../middlewares/auth");
const payOS = require("../utils/payOS"); // Assume this utility handles PayOS API integration

// Create a payment link
router.post("/create", authenticateToken, async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    // Validate input
    if (!orderId || !amount) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // Generate payment link via PayOS
    const paymentLinkResponse = await payOS.createPaymentLink({
      orderId,
      amount,
    });
    const payment = new Payment({
      orderId,
      userId: req.user.id,
      amount,
      status: "pending",
      paymentUrl: paymentLinkResponse.checkoutUrl,
      paymentTimeout: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes timeout
    });

    await payment.save();
    res.json({ success: true, data: { paymentUrl: payment.paymentUrl } });
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Handle PayOS webhook
router.post("/webhook", async (req, res) => {
  try {
    const { orderId, status } = req.body;

    // Validate input
    if (!orderId || !status) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid webhook payload" });
    }

    // Update payment status
    const payment = await Payment.findOne({ orderId });
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    payment.status = status;
    await payment.save();

    res.json({ success: true, message: "Payment status updated" });
  } catch (error) {
    console.error("Error handling webhook:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Reset payment
router.post("/reset", authenticateToken, async (req, res) => {
  try {
    const { paymentId } = req.body;

    // Validate input
    if (!paymentId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing payment ID" });
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    payment.status = "pending";
    payment.paymentUrl = null;
    payment.paymentTimeout = null;
    await payment.save();

    res.json({ success: true, message: "Payment reset successfully" });
  } catch (error) {
    console.error("Error resetting payment:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
