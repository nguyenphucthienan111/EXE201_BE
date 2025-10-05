const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Payment = require("../models/Payment");
const Journal = require("../models/Journal");
const { requireAdminAuth } = require("../middlewares/adminAuth");

/**
 * @openapi
 * /api/admin/dashboard:
 *   get:
 *     summary: "Admin Dashboard - Premium Subscribers Overview"
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
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
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalUsers:
 *                           type: number
 *                         premiumUsers:
 *                           type: number
 *                         activePremiumUsers:
 *                           type: number
 *                         expiringPremiumUsers:
 *                           type: number
 *                         freeUsers:
 *                           type: number
 *                         premiumConversionRate:
 *                           type: string
 *                     recentSubscribers:
 *                       type: array
 *                       items:
 *                         type: object
 *                     expiringSubscriptions:
 *                       type: array
 *                       items:
 *                         type: object
 *                     revenueStats:
 *                       type: object
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get("/dashboard", requireAdminAuth, async (req, res) => {
  try {
    // Get premium statistics
    const stats = await User.getPremiumStats();

    // Get recent premium subscribers (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSubscribers = await User.find({
      plan: "premium",
      premiumStartedAt: { $gte: thirtyDaysAgo },
    })
      .select("name email premiumStartedAt premiumExpiresAt plan")
      .sort({ premiumStartedAt: -1 })
      .limit(10);

    // Get expiring subscriptions (next 7 days)
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiringSubscriptions = await User.find({
      plan: "premium",
      premiumExpiresAt: {
        $lte: sevenDaysFromNow,
        $gt: new Date(),
      },
    })
      .select("name email premiumExpiresAt plan")
      .sort({ premiumExpiresAt: 1 })
      .limit(10);

    // Get revenue statistics
    const totalPayments = await Payment.countDocuments({
      status: "success",
      paymentType: "premium_subscription",
    });

    const totalRevenue = await Payment.aggregate([
      {
        $match: {
          status: "success",
          paymentType: "premium_subscription",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const monthlyRevenue = await Payment.aggregate([
      {
        $match: {
          status: "success",
          paymentType: "premium_subscription",
          paidAt: {
            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Get usage statistics
    const totalJournals = await Journal.countDocuments();
    const premiumJournals = await Journal.countDocuments({
      userId: { $in: await User.distinct("_id", { plan: "premium" }) },
    });

    const revenueStats = {
      totalPayments,
      totalRevenue: totalRevenue[0]?.total || 0,
      monthlyRevenue: monthlyRevenue[0]?.total || 0,
      averageRevenuePerUser:
        totalPayments > 0 ? (totalRevenue[0]?.total || 0) / totalPayments : 0,
    };

    const usageStats = {
      totalJournals,
      premiumJournals,
      freeJournals: totalJournals - premiumJournals,
    };

    res.json({
      success: true,
      data: {
        stats,
        recentSubscribers,
        expiringSubscriptions,
        revenueStats,
        usageStats,
        lastUpdated: new Date(),
      },
    });
  } catch (error) {
    console.error("Error getting admin dashboard data:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving dashboard data",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     summary: "Get all users with pagination"
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: plan
 *         schema:
 *           type: string
 *           enum: [free, premium]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           description: "Search by name or email"
 *     responses:
 *       200:
 *         description: Users retrieved successfully
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
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: number
 *                         totalPages:
 *                           type: number
 *                         totalUsers:
 *                           type: number
 *                         hasNext:
 *                           type: boolean
 *                         hasPrev:
 *                           type: boolean
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get("/users", requireAdminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const plan = req.query.plan;
    const search = req.query.search;

    // Build query
    let query = {};

    if (plan) {
      query.plan = plan;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Calculate pagination
    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);
    const skip = (page - 1) * limit;

    // Get users
    const users = await User.find(query)
      .select(
        "name email plan premiumExpiresAt premiumStartedAt role createdAt"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Add computed fields
    const usersWithStats = users.map((user) => ({
      ...user.toObject(),
      isPremiumActive: user.isPremiumActive(),
      daysLeft: user.getPremiumDaysLeft(),
      isExpiringSoon: user.isPremiumExpiringSoon(),
    }));

    res.json({
      success: true,
      data: {
        users: usersWithStats,
        pagination: {
          currentPage: page,
          totalPages,
          totalUsers,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving users",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/admin/users/{userId}/toggle-role:
 *   patch:
 *     summary: "Toggle user role between user and admin"
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User role updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                     newRole:
 *                       type: string
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.patch(
  "/users/:userId/toggle-role",
  requireAdminAuth,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Prevent admin from removing their own admin role
      if (userId === req.user.id) {
        return res.status(400).json({
          success: false,
          message: "Cannot change your own role",
        });
      }

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Toggle role
      const newRole = user.role === "admin" ? "user" : "admin";
      user.role = newRole;
      await user.save();

      res.json({
        success: true,
        message: `User role updated to ${newRole}`,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
          newRole,
        },
      });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({
        success: false,
        message: "Error updating user role",
        error: error.message,
      });
    }
  }
);

/**
 * @openapi
 * /api/admin/users/{userId}/toggle-premium:
 *   patch:
 *     summary: "Toggle user premium status"
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               durationDays:
 *                 type: integer
 *                 default: 30
 *                 description: "Duration in days for premium subscription"
 *     responses:
 *       200:
 *         description: User premium status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                     newPlan:
 *                       type: string
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.patch(
  "/users/:userId/toggle-premium",
  requireAdminAuth,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { durationDays = 30 } = req.body;

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Toggle premium status
      if (user.plan === "premium" && user.isPremiumActive()) {
        // Downgrade to free
        user.plan = "free";
        user.premiumExpiresAt = null;
        user.premiumStartedAt = null;
      } else {
        // Upgrade to premium
        user.upgradeToPremium(durationDays);
      }

      await user.save();

      res.json({
        success: true,
        message: `User premium status updated`,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            plan: user.plan,
            premiumExpiresAt: user.premiumExpiresAt,
            isPremiumActive: user.isPremiumActive(),
            daysLeft: user.getPremiumDaysLeft(),
          },
          newPlan: user.plan,
        },
      });
    } catch (error) {
      console.error("Error updating user premium status:", error);
      res.status(500).json({
        success: false,
        message: "Error updating user premium status",
        error: error.message,
      });
    }
  }
);

/**
 * @openapi
 * /api/admin/payments:
 *   get:
 *     summary: "Get payment history with pagination"
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, success, failed, cancelled]
 *     responses:
 *       200:
 *         description: Payments retrieved successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get("/payments", requireAdminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;

    // Build query
    let query = {};
    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const totalPayments = await Payment.countDocuments(query);
    const totalPages = Math.ceil(totalPayments / limit);
    const skip = (page - 1) * limit;

    // Get payments with user info
    const payments = await Payment.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          currentPage: page,
          totalPages,
          totalPayments,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error getting payments:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving payments",
      error: error.message,
    });
  }
});

module.exports = router;
