const express = require("express");
const router = express.Router();
const Payment = require("../models/Payment");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { requireAuth } = require("../middlewares/auth");
const {
  createPaymentLink,
  getPaymentLinkInformation,
  verifyPaymentWebhookData,
} = require("../utils/payos");

/**
 * @swagger
 * components:
 *   schemas:
 *     Payment:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Payment ID
 *         userId:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             email:
 *               type: string
 *             name:
 *               type: string
 *         orderId:
 *           type: string
 *           description: Unique order identifier
 *         payosOrderId:
 *           type: string
 *           description: PayOS order code
 *         amount:
 *           type: number
 *           description: Payment amount in VND
 *         paymentType:
 *           type: string
 *           enum: [premium_subscription, other]
 *         status:
 *           type: string
 *           enum: [pending, success, failed, cancelled]
 *         paymentUrl:
 *           type: string
 *           description: PayOS payment URL
 *         description:
 *           type: string
 *           description: Payment description
 *         transactionId:
 *           type: string
 *           description: Transaction ID from PayOS
 *         paidAt:
 *           type: string
 *           format: date-time
 *           description: Payment completion time
 *         cancelledAt:
 *           type: string
 *           format: date-time
 *           description: Payment cancellation time
 *         paymentTimeout:
 *           type: string
 *           format: date-time
 *           description: Payment timeout
 *         isExpired:
 *           type: boolean
 *           description: Whether payment has expired
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Payment creation time
 */

/**
 * @swagger
 * /api/payments/premium:
 *   post:
 *     tags: [Payments]
 *     summary: Tạo payment link cho gói premium 41,000 VND
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tạo payment link thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentUrl:
 *                       type: string
 *                     paymentId:
 *                       type: string
 *                     timeLeft:
 *                       type: number
 *                       description: Thời gian còn lại để thanh toán (giây)
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: User đã có premium hoặc có payment pending
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */
router.post("/premium", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user already has premium
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.plan === "premium") {
      return res.status(400).json({
        success: false,
        message: "User already has premium plan",
      });
    }

    // Check for existing pending payments and mark expired ones
    await Payment.markExpiredPayments();

    const existingPayment = await Payment.findOne({
      userId: userId,
      paymentType: "premium_subscription",
      status: "pending",
    });

    if (existingPayment) {
      // Check if existing payment has expired
      if (existingPayment.isPaymentExpired()) {
        console.log(`Payment ${existingPayment._id} has expired`);
        existingPayment.status = "failed";
        existingPayment.isExpired = true;
        existingPayment.cancelledAt = new Date();
        await existingPayment.save();
      } else {
        try {
          // Check if existing payment is still valid with PayOS
          const paymentInfo = await getPaymentLinkInformation(
            existingPayment.payosOrderId
          );

          // If payment is still valid (status PENDING), return existing link
          if (paymentInfo && paymentInfo.status === "PENDING") {
            return res.status(200).json({
              success: true,
              message:
                "A pending payment already exists for premium subscription. Returning existing payment link.",
              data: {
                paymentUrl: existingPayment.paymentUrl,
                paymentId: existingPayment._id,
                timeLeft: Math.max(
                  0,
                  Math.floor(
                    (existingPayment.paymentTimeout - Date.now()) / 1000
                  )
                ), // seconds left
                expiresAt: existingPayment.paymentTimeout,
              },
            });
          }

          // If payment is expired/cancelled, mark as failed and create new one
          console.log(
            `Payment ${existingPayment._id} is no longer valid, creating new payment`
          );
          existingPayment.status = "failed";
          existingPayment.cancelledAt = new Date();
          await existingPayment.save();
        } catch (error) {
          console.log(
            `Error checking existing payment: ${error.message}, creating new payment`
          );
          // If error checking PayOS (payment not found), mark as failed and create new
          existingPayment.status = "failed";
          existingPayment.cancelledAt = new Date();
          await existingPayment.save();
        }
      }
    }

    // Premium subscription details
    const premiumAmount = 41000;
    const premiumDescription = "Premium upgrade"; // Phải ≤ 25 ký tự

    // Generate unique PayOS order ID (must be a number)
    const orderCode = parseInt(Date.now().toString().slice(-9));
    const orderId = `premium_${userId}_${Date.now()}`;

    // Create PayOS payment data
    const paymentData = {
      orderCode: orderCode,
      amount: premiumAmount,
      description: premiumDescription,
      items: [
        {
          name: "Premium Subscription",
          price: premiumAmount,
          quantity: 1,
        },
      ],
      returnUrl:
        process.env.PAYOS_RETURN_URL ||
        `${process.env.CLIENT_URL}/payment/success`,
      cancelUrl:
        process.env.PAYOS_CANCEL_URL ||
        `${process.env.CLIENT_URL}/payment/cancel`,
    };

    // Debug log to check payment data
    console.log(
      "PayOS premium payment data:",
      JSON.stringify(paymentData, null, 2)
    );

    // Create payment link with PayOS
    const paymentLinkResponse = await createPaymentLink(paymentData);

    // Create payment record in database with timeout
    const payment = new Payment({
      orderId: orderId,
      userId: userId,
      payosOrderId: orderCode.toString(),
      amount: premiumAmount,
      paymentType: "premium_subscription",
      status: "pending",
      paymentUrl: paymentLinkResponse.checkoutUrl,
      description: premiumDescription,
      // paymentTimeout will be set automatically by pre-save middleware (2 minutes)
    });

    await payment.save();

    res.json({
      success: true,
      data: {
        paymentUrl: paymentLinkResponse.checkoutUrl,
        paymentId: payment._id,
        orderCode: payment.payosOrderId,
        timeLeft: Math.max(
          0,
          Math.floor((payment.paymentTimeout - Date.now()) / 1000)
        ), // seconds left (2 minutes)
        expiresAt: payment.paymentTimeout,
      },
    });
  } catch (error) {
    console.error("Error creating premium payment:", error);
    res.status(500).json({
      success: false,
      message: "Error creating premium payment",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/payments/check-user-plan:
 *   get:
 *     tags: [Payments]
 *     summary: Kiểm tra plan hiện tại của user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get("/check-user-plan", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Also get payment history
    const payments = await Payment.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        userId: user._id,
        email: user.email,
        currentPlan: user.plan,
        recentPayments: payments.map((p) => ({
          id: p._id,
          amount: p.amount,
          status: p.status,
          paymentType: p.paymentType,
          createdAt: p.createdAt,
          paidAt: p.paidAt,
        })),
      },
    });
  } catch (error) {
    console.error("Error checking user plan:", error);
    res.status(500).json({
      success: false,
      message: "Error checking user plan",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/payments/{paymentId}:
 *   get:
 *     tags: [Payments]
 *     summary: Lấy thông tin payment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của payment
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   description: Payment information
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền xem payment này
 *       404:
 *         description: Không tìm thấy payment
 *       500:
 *         description: Lỗi server
 */
router.get("/:paymentId", requireAuth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId).populate(
      "userId",
      "email name"
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    if (payment.userId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this payment",
      });
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error("Error retrieving payment:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving payment",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: PayOS webhook để xử lý callback
 *     description: Nhận webhook từ PayOS khi có thay đổi trạng thái thanh toán
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: Mã trạng thái từ PayOS
 *                 example: "00"
 *               data:
 *                 type: object
 *                 properties:
 *                   orderCode:
 *                     type: number
 *                     description: Mã đơn hàng
 *                   amount:
 *                     type: number
 *                     description: Số tiền thanh toán
 *                   description:
 *                     type: string
 *                     description: Mô tả giao dịch
 *                   transactionDateTime:
 *                     type: string
 *                     description: Thời gian giao dịch
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid webhook data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid webhook data"
 *       500:
 *         description: Server error
 */
router.post("/webhook", async (req, res) => {
  try {
    console.log("PayOS webhook received:", JSON.stringify(req.body, null, 2));

    const webhookData = req.body;

    // Handle empty body (for testing purposes)
    if (!webhookData || Object.keys(webhookData).length === 0) {
      console.log("Empty webhook body received (testing)");
      return res.json({
        success: true,
        message: "Webhook endpoint is working. Send actual PayOS data.",
      });
    }

    // Verify webhook signature if needed
    // const isValidSignature = verifyPaymentWebhookData(webhookData);

    if (webhookData.code === "00" && webhookData.data) {
      // Payment successful
      const paymentData = webhookData.data;

      if (!paymentData.orderCode) {
        console.error("Missing orderCode in webhook data");
        return res.status(400).json({
          success: false,
          message: "Missing orderCode in webhook data",
        });
      }

      // Update payment status in database
      const payment = await Payment.findOne({
        payosOrderId: paymentData.orderCode.toString(),
      });

      if (payment) {
        payment.status = "success";
        payment.transactionId = paymentData.transactionDateTime;
        payment.paidAt = new Date();
        await payment.save();

        // Update user plan to premium if payment is for premium subscription
        if (payment.paymentType === "premium_subscription") {
          const user = await User.findById(payment.userId);
          if (user) {
            // Upgrade to premium for 30 days
            user.upgradeToPremium(30);
            await user.save();

            // Create notification for successful upgrade
            await Notification.createPremiumUpgradeNotification(
              user._id,
              payment.amount,
              user.premiumExpiresAt
            );

            console.log(
              `User ${user.email} upgraded to premium plan until ${user.premiumExpiresAt}`
            );
          }
        }

        console.log(
          `Payment ${payment._id} marked as successful and user upgraded to premium`
        );

        // Return detailed success response for actual payments
        return res.json({
          success: true,
          message: "Payment processed successfully",
          data: {
            paymentId: payment._id,
            userId: payment.userId,
            status: "success",
            paymentType: payment.paymentType,
          },
        });
      } else {
        console.log(
          `Payment not found for orderCode: ${paymentData.orderCode}`
        );

        // Return informative response for unknown orderCode
        return res.json({
          success: true,
          message: `No payment found for orderCode: ${paymentData.orderCode}. This may be a test or invalid orderCode.`,
        });
      }
    } else if (
      webhookData.code &&
      webhookData.code !== "00" &&
      webhookData.data
    ) {
      // Payment failed or cancelled
      const paymentData = webhookData.data;

      if (!paymentData.orderCode) {
        console.error("Missing orderCode in failed webhook data");
        return res.status(400).json({
          success: false,
          message: "Missing orderCode in webhook data",
        });
      }

      const payment = await Payment.findOne({
        payosOrderId: paymentData.orderCode.toString(),
      });

      if (payment) {
        payment.status = "failed";
        payment.cancelledAt = new Date();
        await payment.save();

        console.log(`Payment ${payment._id} marked as failed`);

        // Return detailed response for failed payments
        return res.json({
          success: true,
          message: "Failed payment processed",
          data: {
            paymentId: payment._id,
            userId: payment.userId,
            status: "failed",
          },
        });
      } else {
        console.log(
          `Payment not found for failed orderCode: ${paymentData.orderCode}`
        );

        // Return informative response for unknown failed orderCode
        return res.json({
          success: true,
          message: `No payment found for failed orderCode: ${paymentData.orderCode}. This may be a test or invalid orderCode.`,
        });
      }
    } else {
      console.log(
        "Webhook data received but no valid code/data structure found"
      );
      return res.status(400).json({
        success: false,
        message:
          "Invalid webhook data format. Expected PayOS webhook structure.",
      });
    }

    // Fallback response (shouldn't reach here normally)
    res.json({
      success: true,
      message: "Webhook received but no specific action taken",
    });
  } catch (error) {
    console.error("Error processing PayOS webhook:", error);
    res.status(500).json({
      success: false,
      message: "Error processing webhook",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/payments/status/premium:
 *   get:
 *     tags: [Payments]
 *     summary: Kiểm tra trạng thái thanh toán premium của user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     hasActivePayment:
 *                       type: boolean
 *                     paymentExpired:
 *                       type: boolean
 *                     timeLeft:
 *                       type: number
 *                     paymentUrl:
 *                       type: string
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */
router.get("/status/premium", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const payment = await Payment.findOne({
      userId: userId,
      paymentType: "premium_subscription",
      status: "pending",
    });

    if (!payment) {
      return res.json({
        success: true,
        data: {
          hasActivePayment: false,
          paymentExpired: false,
        },
      });
    }

    const isExpired = payment.isPaymentExpired();
    if (isExpired && !payment.isExpired) {
      // Mark as expired
      payment.status = "failed";
      payment.isExpired = true;
      payment.cancelledAt = new Date();
      await payment.save();
    }

    res.json({
      success: true,
      data: {
        hasActivePayment: !isExpired,
        paymentExpired: isExpired,
        timeLeft: isExpired
          ? 0
          : Math.max(
              0,
              Math.floor((payment.paymentTimeout - Date.now()) / 1000)
            ),
        paymentUrl: isExpired ? null : payment.paymentUrl,
        expiresAt: payment.paymentTimeout,
      },
    });
  } catch (error) {
    console.error("Error checking premium payment status:", error);
    res.status(500).json({
      success: false,
      message: "Error checking premium payment status",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/payments/reset/premium:
 *   post:
 *     tags: [Payments]
 *     summary: Reset pending premium payments (mark as failed)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reset payment thành công
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */
router.post("/reset/premium", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Find and update all pending premium payments for this user
    const result = await Payment.updateMany(
      {
        userId: userId,
        paymentType: "premium_subscription",
        status: "pending",
      },
      {
        status: "failed",
        cancelledAt: new Date(),
      }
    );

    console.log(
      `Reset ${result.modifiedCount} pending premium payments for user ${userId}`
    );

    res.json({
      success: true,
      message: `Reset ${result.modifiedCount} pending premium payments`,
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Error resetting premium payments:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting premium payments",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/payments/test-webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Test webhook manually để debug
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderCode:
 *                 type: string
 *                 description: Order code để test
 *     responses:
 *       200:
 *         description: Test thành công
 */
router.post("/test-webhook", async (req, res) => {
  try {
    const { orderCode } = req.body;

    if (!orderCode) {
      return res.status(400).json({
        success: false,
        message: "OrderCode is required",
      });
    }

    // Simulate successful webhook data
    const webhookData = {
      code: "00",
      data: {
        orderCode: parseInt(orderCode),
        amount: 10000,
        description: "Premium upgrade",
        transactionDateTime: new Date().toISOString(),
      },
    };

    console.log(
      "Manual webhook test with data:",
      JSON.stringify(webhookData, null, 2)
    );

    // Find payment by orderCode
    const payment = await Payment.findOne({
      payosOrderId: orderCode.toString(),
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: `Payment not found for orderCode: ${orderCode}`,
      });
    }

    // Update payment status
    payment.status = "success";
    payment.transactionId = webhookData.data.transactionDateTime;
    payment.paidAt = new Date();
    await payment.save();

    // Update user plan to premium if payment is for premium subscription
    if (payment.paymentType === "premium_subscription") {
      const user = await User.findById(payment.userId);
      if (user) {
        console.log(`Before update - User ${user.email} plan:`, user.plan);

        // Upgrade to premium for 30 days
        user.upgradeToPremium(30);
        await user.save();

        // Create notification for successful upgrade
        await Notification.createPremiumUpgradeNotification(
          user._id,
          payment.amount,
          user.premiumExpiresAt
        );

        console.log(
          `After update - User ${user.email} plan:`,
          user.plan,
          "expires:",
          user.premiumExpiresAt
        );
      }
    }

    res.json({
      success: true,
      message: "Manual webhook test completed",
      data: {
        paymentId: payment._id,
        userId: payment.userId,
        oldStatus: "pending",
        newStatus: "success",
        userUpdated: true,
      },
    });
  } catch (error) {
    console.error("Error in manual webhook test:", error);
    res.status(500).json({
      success: false,
      message: "Error in manual webhook test",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/payments/confirm/{paymentId}:
 *   get:
 *     tags: [Payments]
 *     summary: Xác nhận trạng thái thanh toán trực tiếp từ PayOS (không cần webhook)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của payment đã tạo
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Thiếu hoặc sai dữ liệu
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy payment
 *       500:
 *         description: Lỗi server
 */
router.get("/confirm/:paymentId", requireAuth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId);

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    if (payment.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to confirm this payment",
      });
    }

    // If already finalized, return immediately
    if (payment.status === "success") {
      return res.json({
        success: true,
        data: {
          paymentId: payment._id,
          status: payment.status,
          paidAt: payment.paidAt,
        },
      });
    }

    // Query PayOS for the latest info using orderCode
    const payosInfo = await getPaymentLinkInformation(payment.payosOrderId);

    // Normalize status mapping
    const rawStatus = (payosInfo && payosInfo.status) || "";
    // PayOS statuses commonly: PENDING, PAID, CANCELED/EXPIRED
    if (
      rawStatus === "PAID" ||
      rawStatus === "SUCCESS" ||
      rawStatus === "SUCCEEDED"
    ) {
      payment.status = "success";
      payment.paidAt = new Date();
      await payment.save();

      // Upgrade user if premium payment
      if (payment.paymentType === "premium_subscription") {
        const user = await User.findById(payment.userId);
        if (user) {
          user.upgradeToPremium(30);
          await user.save();
          await Notification.createPremiumUpgradeNotification(
            user._id,
            payment.amount,
            user.premiumExpiresAt
          );
        }
      }

      return res.json({
        success: true,
        message: "Payment confirmed and user upgraded",
        data: {
          paymentId: payment._id,
          status: payment.status,
        },
      });
    }

    if (
      rawStatus === "CANCELED" ||
      rawStatus === "CANCELLED" ||
      rawStatus === "EXPIRED"
    ) {
      payment.status = "failed";
      payment.cancelledAt = new Date();
      await payment.save();
      return res.json({
        success: true,
        message: "Payment marked as failed",
        data: { paymentId: payment._id, status: payment.status },
      });
    }

    // Still pending or unknown -> return info
    return res.json({
      success: true,
      message: "Payment still pending or unrecognized status",
      data: {
        paymentId: payment._id,
        status: payment.status,
        payosStatus: rawStatus,
      },
    });
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({
      success: false,
      message: "Error confirming payment",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/payments/check-user-plan:
 *   get:
 *     tags: [Payments]
 *     summary: Kiểm tra plan hiện tại của user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get("/check-user-plan", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Also get payment history
    const payments = await Payment.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        userId: user._id,
        email: user.email,
        currentPlan: user.plan,
        recentPayments: payments.map((p) => ({
          id: p._id,
          amount: p.amount,
          status: p.status,
          paymentType: p.paymentType,
          createdAt: p.createdAt,
          paidAt: p.paidAt,
        })),
      },
    });
  } catch (error) {
    console.error("Error checking user plan:", error);
    res.status(500).json({
      success: false,
      message: "Error checking user plan",
      error: error.message,
    });
  }
});

module.exports = router;
