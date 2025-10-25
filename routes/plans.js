var express = require("express");
var router = express.Router();
var { requireAuth } = require("../middlewares/auth");
var User = require("../models/User");
var Notification = require("../models/Notification");

// Upgrade/downgrade plan (mock, integrate payment later)
/**
 * @openapi
 * /api/plans/set:
 *   post:
 *     summary: "Set user plan (Development only - Production protected)"
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan: { type: string, enum: [free, premium] }
 *     responses:
 *       200: { description: Updated plan }
 */
router.post("/set", requireAuth, async function (req, res) {
  try {
    // SECURITY: Only allow in development
    if (process.env.NODE_ENV === "production") {
      return res
        .status(404)
        .json({ message: "Endpoint not available in production" });
    }

    var plan = req.body.plan === "premium" ? "premium" : "free";
    var user = await User.findById(req.user._id);

    if (plan === "premium") {
      user.upgradeToPremium(30);
      await Notification.createPremiumUpgradeNotification(
        user._id,
        41000,
        user.premiumExpiresAt
      );
    } else {
      user.plan = "free";
      user.premiumExpiresAt = null;
      user.premiumStartedAt = null;
    }

    await user.save();
    res.json({
      plan: user.plan,
      premiumExpiresAt: user.premiumExpiresAt,
      premiumStartedAt: user.premiumStartedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @openapi
 * /api/plans/me:
 *   get:
 *     summary: "Get current plan (Free & Premium: basic info)"
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Plan }
 */
router.get("/me", requireAuth, function (req, res) {
  res.json({ plan: req.user.plan });
});

/**
 * @swagger
 * /api/plans/subscription:
 *   get:
 *     tags: [Plans]
 *     summary: User xem chi tiết gói premium còn bao nhiêu ngày
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin subscription
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
 *                     plan:
 *                       type: string
 *                       enum: [free, premium]
 *                     isPremiumActive:
 *                       type: boolean
 *                     daysLeft:
 *                       type: number
 *                     premiumExpiresAt:
 *                       type: string
 *                       format: date-time
 *                     premiumStartedAt:
 *                       type: string
 *                       format: date-time
 *                     isExpiringSoon:
 *                       type: boolean
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */
router.get("/subscription", requireAuth, async function (req, res) {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Debug log for user data
    console.log("🔍 User subscription debug:", {
      userId: user._id,
      email: user.email,
      plan: user.plan,
      premiumExpiresAt: user.premiumExpiresAt,
      premiumStartedAt: user.premiumStartedAt,
      currentTime: new Date(),
      isPremiumActive: user.isPremiumActive(),
      daysLeft: user.getPremiumDaysLeft(),
    });

    const subscriptionData = {
      plan: user.plan,
      isPremiumActive: user.isPremiumActive(),
      daysLeft: user.getPremiumDaysLeft(),
      premiumExpiresAt: user.premiumExpiresAt,
      premiumStartedAt: user.premiumStartedAt,
      isExpiringSoon: user.isPremiumExpiringSoon(),
    };

    res.json({
      success: true,
      data: subscriptionData,
    });
  } catch (error) {
    console.error("Error getting subscription info:", error);
    res.status(500).json({
      success: false,
      message: "Error getting subscription info",
      error: error.message,
    });
  }
});

module.exports = router;
