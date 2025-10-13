const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const User = require("../models/User");
const { requireAuth } = require("../middlewares/auth");
const { requireAdminAuth } = require("../middlewares/adminAuth");

/**
 * @openapi
 * /api/reviews:
 *   post:
 *     summary: Submit a product review (1 review per user)
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Rating from 1 to 5 stars
 *                 example: 5
 *               feedback:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Optional feedback text
 *                 example: "Great app! Love the journaling features."
 *     responses:
 *       201:
 *         description: Review submitted successfully
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
 *                     review:
 *                       type: object
 *       400:
 *         description: Invalid input or user already reviewed
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { rating, feedback = "" } = req.body;
    const userId = req.user.id;

    // Validation
    if (!rating || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer between 1 and 5",
      });
    }

    if (feedback && feedback.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Feedback must be less than 1000 characters",
      });
    }

    // Check if user already has a review
    const existingReview = await Review.findOne({ userId });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message:
          "You have already submitted a review. Each user can only review once.",
        data: {
          existingReview: {
            id: existingReview._id,
            rating: existingReview.rating,
            feedback: existingReview.feedback,
            isVisible: existingReview.isVisible,
            createdAt: existingReview.createdAt,
          },
        },
      });
    }

    // Create new review
    const review = new Review({
      userId,
      rating,
      feedback: feedback.trim(),
      userAgent: req.get("User-Agent") || "",
      ipAddress: req.ip || req.connection.remoteAddress || "",
    });

    await review.save();

    res.status(201).json({
      success: true,
      message: "Review submitted successfully. Thank you for your feedback!",
      data: {
        review: {
          id: review._id,
          rating: review.rating,
          feedback: review.feedback,
          createdAt: review.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Error submitting review:", error);
    res.status(500).json({
      success: false,
      message: "Error submitting review",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/reviews/my-review:
 *   get:
 *     summary: Get current user's review
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: User's review retrieved successfully
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
 *                     hasReview:
 *                       type: boolean
 *                     review:
 *                       type: object
 *       404:
 *         description: User has not submitted a review
 *       500:
 *         description: Server error
 */
router.get("/my-review", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const review = await Review.findOne({ userId }).populate(
      "userId",
      "name email"
    );

    if (!review) {
      return res.status(404).json({
        success: true,
        data: {
          hasReview: false,
          message: "You have not submitted a review yet",
        },
      });
    }

    res.json({
      success: true,
      data: {
        hasReview: true,
        review: {
          id: review._id,
          rating: review.rating,
          feedback: review.feedback,
          isVisible: review.isVisible,
          createdAt: review.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Error getting user review:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving review",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/reviews/public:
 *   get:
 *     summary: Get approved reviews for public display
 *     tags: [Reviews]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Approved reviews retrieved successfully
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
 *                     reviews:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totalCount:
 *                       type: number
 *                     hasMore:
 *                       type: boolean
 *       500:
 *         description: Server error
 */
router.get("/public", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = parseInt(req.query.skip) || 0;

    const [reviews, totalCount] = await Promise.all([
      Review.getVisibleReviews(limit, skip),
      Review.countDocuments({ isVisible: true }),
    ]);

    res.json({
      success: true,
      data: {
        reviews: reviews.map((review) => ({
          id: review._id,
          rating: review.rating,
          feedback: review.feedback,
          userName: review.userId ? review.userId.name : "Anonymous",
          createdAt: review.createdAt,
        })),
        totalCount,
        hasMore: skip + limit < totalCount,
      },
    });
  } catch (error) {
    console.error("Error getting public reviews:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving reviews",
      error: error.message,
    });
  }
});

// Admin routes for review management
/**
 * @openapi
 * /api/reviews/admin:
 *   get:
 *     summary: Get all reviews for admin viewing and management
 *     tags: [Admin Reviews]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [visible, hidden, all]
 *           default: all
 *       - in: query
 *         name: rating
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         description: Filter reviews by specific rating (1-5 stars)
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
 *     responses:
 *       200:
 *         description: Reviews retrieved successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get("/admin", requireAdminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const visibility = req.query.visibility || "all";
    const rating = req.query.rating ? parseInt(req.query.rating) : null;

    // Validation for rating parameter
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Build query
    let query = {};
    if (visibility === "visible") {
      query.isVisible = true;
    } else if (visibility === "hidden") {
      query.isVisible = false;
    }
    // If "all", no additional visibility query conditions

    // Add rating filter if specified
    if (rating) {
      query.rating = rating;
    }

    // Calculate pagination
    const totalReviews = await Review.countDocuments(query);
    const totalPages = Math.ceil(totalReviews / limit);
    const skip = (page - 1) * limit;

    // Get reviews with user info
    const reviews = await Review.find(query)
      .populate("userId", "name email plan")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get statistics
    const stats = await Review.getReviewStats();

    res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          currentPage: page,
          totalPages,
          totalReviews,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        filters: {
          visibility: visibility,
          rating: rating || null,
        },
        statistics: stats,
      },
    });
  } catch (error) {
    console.error("Error getting admin reviews:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving reviews",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/reviews/admin/{reviewId}/visibility:
 *   patch:
 *     summary: Toggle review visibility (hide/show review)
 *     tags: [Admin Reviews]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: reviewId
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
 *               isVisible:
 *                 type: boolean
 *                 description: true to show, false to hide
 *     responses:
 *       200:
 *         description: Review visibility updated successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Review not found
 *       500:
 *         description: Server error
 */
router.patch(
  "/admin/:reviewId/visibility",
  requireAdminAuth,
  async (req, res) => {
    try {
      const { reviewId } = req.params;
      const { isVisible } = req.body;

      // Validation
      if (typeof isVisible !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isVisible must be a boolean value",
        });
      }

      // Find and update review
      const review = await Review.findById(reviewId);
      if (!review) {
        return res.status(404).json({
          success: false,
          message: "Review not found",
        });
      }

      review.isVisible = isVisible;
      await review.save();

      // Populate user info for response
      await review.populate("userId", "name email");

      res.json({
        success: true,
        message: `Review ${isVisible ? "made visible" : "hidden"} successfully`,
        data: {
          review: {
            id: review._id,
            rating: review.rating,
            feedback: review.feedback,
            isVisible: review.isVisible,
            user: {
              id: review.userId._id,
              name: review.userId.name,
              email: review.userId.email,
            },
          },
        },
      });
    } catch (error) {
      console.error("Error updating review visibility:", error);
      res.status(500).json({
        success: false,
        message: "Error updating review visibility",
        error: error.message,
      });
    }
  }
);

/**
 * @openapi
 * /api/reviews/admin/stats:
 *   get:
 *     summary: Get review statistics for admin dashboard
 *     tags: [Admin Reviews]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Review statistics retrieved successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get("/admin/stats", requireAdminAuth, async (req, res) => {
  try {
    const stats = await Review.getReviewStats();

    // Get recent reviews (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentReviews = await Review.find({
      createdAt: { $gte: sevenDaysAgo },
    })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        ...stats,
        recentReviews: recentReviews.map((review) => ({
          id: review._id,
          rating: review.rating,
          feedback: review.feedback,
          isVisible: review.isVisible,
          createdAt: review.createdAt,
          user: {
            name: review.userId.name,
            email: review.userId.email,
          },
        })),
      },
    });
  } catch (error) {
    console.error("Error getting review stats:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving review statistics",
      error: error.message,
    });
  }
});

module.exports = router;
