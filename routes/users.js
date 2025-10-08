var express = require("express");
var router = express.Router();
var { requireAuth } = require("../middlewares/auth");
var User = require("../models/User");
var Journal = require("../models/Journal");
var Mood = require("../models/Mood");

/* Get my profile */
/**
 * @openapi
 * /users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 email: { type: string }
 *                 name: { type: string }
 *                 plan: { type: string, enum: [free, premium] }
 *                 isEmailVerified: { type: boolean }
 *                 premiumExpiresAt: { type: string, format: date-time }
 *                 premiumDaysLeft: { type: number }
 *                 isPremiumActive: { type: boolean }
 *                 createdAt: { type: string, format: date-time }
 */
router.get("/me", requireAuth, function (req, res) {
  const user = req.user;
  res.json({
    id: user._id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    isEmailVerified: user.isEmailVerified,
    premiumExpiresAt: user.premiumExpiresAt,
    premiumDaysLeft: user.getPremiumDaysLeft(),
    isPremiumActive: user.isPremiumActive(),
    createdAt: user.createdAt,
  });
});

/* Update my profile */
/**
 * @openapi
 * /users/me:
 *   put:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 100 }
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data: { type: object }
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.put("/me", requireAuth, async function (req, res) {
  try {
    const { name } = req.body;

    // Validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Name is required and must be a non-empty string",
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must be less than 100 characters",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { name: name.trim() },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: {
        id: updatedUser._id,
        email: updatedUser.email,
        name: updatedUser.name,
        plan: updatedUser.plan,
        isEmailVerified: updatedUser.isEmailVerified,
        premiumExpiresAt: updatedUser.premiumExpiresAt,
        premiumDaysLeft: updatedUser.getPremiumDaysLeft(),
        isPremiumActive: updatedUser.isPremiumActive(),
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: err.message,
    });
  }
});

/**
 * @openapi
 * /users/stats:
 *   get:
 *     summary: Get simple usage statistics for current user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalJournals: { type: number }
 *                     totalMoods: { type: number }
 *                     accountAge: { type: number, description: "Days since account creation" }
 *                     plan: { type: string }
 *                     isPremiumActive: { type: boolean }
 *                     premiumDaysLeft: { type: number }
 *       500:
 *         description: Server error
 */
router.get("/stats", requireAuth, async function (req, res) {
  try {
    const [journals, moods] = await Promise.all([
      Journal.countDocuments({ userId: req.user._id }),
      Mood.countDocuments({ userId: req.user._id }),
    ]);

    // Calculate account age in days
    const accountAge = Math.floor(
      (Date.now() - req.user.createdAt) / (1000 * 60 * 60 * 24)
    );

    res.json({
      success: true,
      data: {
        totalJournals: journals,
        totalMoods: moods,
        accountAge: accountAge,
        plan: req.user.plan,
        isPremiumActive: req.user.isPremiumActive(),
        premiumDaysLeft: req.user.getPremiumDaysLeft(),
      },
    });
  } catch (err) {
    console.error("Error getting user stats:", err);
    res.status(500).json({
      success: false,
      message: "Error getting user statistics",
      error: err.message,
    });
  }
});

/**
 * @openapi
 * /users/premium-info:
 *   get:
 *     summary: Get detailed premium subscription information
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Premium info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { type: string }
 *                     isPremiumActive: { type: boolean }
 *                     premiumStartedAt: { type: string, format: date-time }
 *                     premiumExpiresAt: { type: string, format: date-time }
 *                     premiumDaysLeft: { type: number }
 *                     isPremiumExpiringSoon: { type: boolean }
 *       500:
 *         description: Server error
 */
router.get("/premium-info", requireAuth, async function (req, res) {
  try {
    const user = req.user;

    res.json({
      success: true,
      data: {
        plan: user.plan,
        isPremiumActive: user.isPremiumActive(),
        premiumStartedAt: user.premiumStartedAt,
        premiumExpiresAt: user.premiumExpiresAt,
        premiumDaysLeft: user.getPremiumDaysLeft(),
        isPremiumExpiringSoon: user.isPremiumExpiringSoon(),
      },
    });
  } catch (err) {
    console.error("Error getting premium info:", err);
    res.status(500).json({
      success: false,
      message: "Error getting premium information",
      error: err.message,
    });
  }
});

module.exports = router;
