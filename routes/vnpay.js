var express = require("express");
var router = express.Router();
var { requireAuth } = require("../middlewares/auth");
var vnpay = require("../utils/vnpay");
var Payment = require("../models/Payment");
var User = require("../models/User");
var { v4: uuidv4 } = require("uuid");

/**
 * @openapi
 * /api/payments/vnpay/create:
 *   post:
 *     summary: Create VNPAY payment URL for premium subscription (41,000 VND)
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Payment URL }
 */
router.post("/create", requireAuth, async function (req, res) {
  try {
    var orderId = uuidv4().replace(/-/g, "").slice(0, 12).toUpperCase();
    var amount = 41000;
    var paymentUrl = vnpay.buildPaymentUrl({
      orderId: orderId,
      amount: amount,
      ipAddr: req.ip,
      orderInfo: "Premium subscription 1 month",
    });
    await new Payment({
      userId: req.user._id,
      orderId: orderId,
      amount: amount,
      status: "pending",
      paymentUrl: paymentUrl,
    }).save();
    res.json({ paymentUrl: paymentUrl, orderId: orderId });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * @openapi
 * /api/payments/vnpay/return:
 *   get:
 *     summary: VNPAY return URL handler
 *     tags: [Payments]
 *     responses:
 *       200: { description: Result }
 */
router.get("/return", async function (req, res) {
  var valid = vnpay.verifyReturn(req.query);
  var orderId = req.query.vnp_TxnRef;
  var rspCode = req.query.vnp_ResponseCode;
  try {
    var payment = await Payment.findOne({ orderId: orderId });
    if (!payment) return res.status(404).send("Payment not found");
    if (!valid) {
      payment.status = "failed";
      await payment.save();
      return res.send("Invalid signature");
    }
    if (rspCode === "00") {
      payment.status = "success";
      await payment.save();
      await User.findByIdAndUpdate(payment.userId, { plan: "premium" });
      return res.send("Payment success. Premium activated.");
    } else {
      payment.status = "failed";
      await payment.save();
      return res.send("Payment failed with code " + rspCode);
    }
  } catch (e) {
    return res.status(500).send(e.message);
  }
});

/**
 * @openapi
 * /api/payments/vnpay/ipn:
 *   get:
 *     summary: VNPAY IPN (server to server) handler
 *     tags: [Payments]
 *     responses:
 *       200: { description: Acknowledged }
 */
router.get("/ipn", async function (req, res) {
  var valid = vnpay.verifyReturn(req.query);
  var orderId = req.query.vnp_TxnRef;
  var rspCode = req.query.vnp_ResponseCode;
  if (!valid) return res.json({ RspCode: "97", Message: "Invalid signature" });
  try {
    var payment = await Payment.findOne({ orderId: orderId });
    if (!payment)
      return res.json({ RspCode: "01", Message: "Order not found" });
    if (rspCode === "00") {
      payment.status = "success";
      await payment.save();
      await User.findByIdAndUpdate(payment.userId, { plan: "premium" });
      return res.json({ RspCode: "00", Message: "Success" });
    }
    payment.status = "failed";
    await payment.save();
    return res.json({ RspCode: "00", Message: "Failed recorded" });
  } catch (e) {
    return res.json({ RspCode: "99", Message: e.message });
  }
});

module.exports = router;
