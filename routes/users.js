var express = require("express");
var router = express.Router();
var { requireAuth } = require("../middlewares/auth");
var User = require("../models/User");
var Journal = require("../models/Journal");
var Mood = require("../models/Mood");
var multer = require("multer");
var path = require("path");
var fs = require("fs");

// Configure multer for avatar uploads
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/avatars/");
  },
  filename: function (req, file, cb) {
    // Generate unique filename: userId_timestamp.extension
    var userId = req.user._id.toString();
    var timestamp = Date.now();
    var extension = path.extname(file.originalname);
    cb(null, `${userId}_${timestamp}${extension}`);
  },
});

var upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Only allow image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

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

  // Convert relative avatar path to full URL if it exists
  var avatarUrl = user.avatar;
  if (avatarUrl && avatarUrl.startsWith("/uploads/")) {
    avatarUrl = `${req.protocol}://${req.get("host")}${avatarUrl}`;
  }

  res.json({
    id: user._id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    isEmailVerified: user.isEmailVerified,
    premiumExpiresAt: user.premiumExpiresAt,
    premiumDaysLeft: user.getPremiumDaysLeft(),
    isPremiumActive: user.isPremiumActive(),
    avatar: avatarUrl,
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
    console.log("PUT /api/users/me - Request received");
    console.log("Request body:", req.body);
    console.log("User:", req.user ? req.user._id : "No user");

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

/**
 * @openapi
 * /users/change-email:
 *   post:
 *     summary: Change user email address
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newEmail]
 *             properties:
 *               newEmail: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Verification email sent
 *       400:
 *         description: Invalid email
 *       500:
 *         description: Server error
 */
router.post("/change-email", requireAuth, async function (req, res) {
  try {
    const { newEmail } = req.body;

    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    if (newEmail.toLowerCase() === req.user.email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "New email must be different from current email",
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: newEmail.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email address already in use",
      });
    }

    // Generate verification code
    const verificationCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    // Update user with pending email change
    req.user.pendingEmail = newEmail.toLowerCase();
    req.user.emailVerificationCode = verificationCode;
    await req.user.save();

    // Send verification email to new email
    const { sendVerificationEmail } = require("../utils/mailer");
    await sendVerificationEmail(newEmail, verificationCode);

    res.json({
      success: true,
      message: "Verification email sent to your new email address",
    });
  } catch (err) {
    console.error("Error changing email:", err);
    res.status(500).json({
      success: false,
      message: "Error changing email",
      error: err.message,
    });
  }
});

/**
 * @openapi
 * /users/resend-verification:
 *   post:
 *     summary: Resend email verification
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Verification email sent
 *       500:
 *         description: Server error
 */
router.post("/resend-verification", requireAuth, async function (req, res) {
  try {
    if (req.user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified",
      });
    }

    // Generate new verification code
    const verificationCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
    req.user.emailVerificationCode = verificationCode;
    await req.user.save();

    // Send verification email
    const { sendVerificationEmail } = require("../utils/mailer");
    await sendVerificationEmail(req.user.email, verificationCode);

    res.json({
      success: true,
      message: "Verification email sent successfully",
    });
  } catch (err) {
    console.error("Error resending verification:", err);
    res.status(500).json({
      success: false,
      message: "Error resending verification email",
      error: err.message,
    });
  }
});

/**
 * @openapi
 * /users/avatar:
 *   post:
 *     summary: Upload user avatar
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
 *       400:
 *         description: Invalid file
 *       500:
 *         description: Server error
 */
router.post(
  "/avatar",
  requireAuth,
  upload.single("avatar"),
  async function (req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      // Delete old avatar if exists
      if (req.user.avatar && req.user.avatar.includes("uploads/avatars/")) {
        var oldAvatarPath = path.join(__dirname, "..", req.user.avatar);
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      }

      // Update user avatar with new file path
      var avatarUrl = `/uploads/avatars/${req.file.filename}`;
      req.user.avatar = avatarUrl;
      await req.user.save();

      // Return full URL for frontend
      var fullAvatarUrl = `${req.protocol}://${req.get("host")}${avatarUrl}`;

      res.json({
        success: true,
        message: "Avatar updated successfully",
        data: {
          avatarUrl: fullAvatarUrl,
        },
      });
    } catch (err) {
      console.error("Error uploading avatar:", err);
      res.status(500).json({
        success: false,
        message: "Error uploading avatar",
        error: err.message,
      });
    }
  }
);

/**
 * @openapi
 * /users/avatar:
 *   delete:
 *     summary: Remove user avatar
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Avatar removed successfully
 *       500:
 *         description: Server error
 */
router.delete("/avatar", requireAuth, async function (req, res) {
  try {
    req.user.avatar = null;
    await req.user.save();

    res.json({
      success: true,
      message: "Avatar removed successfully",
    });
  } catch (err) {
    console.error("Error removing avatar:", err);
    res.status(500).json({
      success: false,
      message: "Error removing avatar",
      error: err.message,
    });
  }
});

module.exports = router;
