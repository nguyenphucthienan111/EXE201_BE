const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { requireAuth } = require("../middlewares/auth");
const { triggerNotificationCheck } = require("../utils/notificationScheduler");

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: "Get user notifications (Free & Premium: full access)"
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 20
 *         description: Số lượng notifications
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *           default: 1
 *         description: Trang hiện tại
 *       - in: query
 *         name: unread
 *         schema:
 *           type: boolean
 *         description: Chỉ lấy notifications chưa đọc
 *     responses:
 *       200:
 *         description: Danh sách notifications
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
 *                     notifications:
 *                       type: array
 *                       items:
 *                         type: object
 *                     unreadCount:
 *                       type: number
 *                     pagination:
 *                       type: object
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { limit = 20, page = 1, unread } = req.query;
    const skip = (page - 1) * limit;
    const userId = req.user.id;

    let query = { userId: userId };

    // Filter unread only
    if (unread === "true") {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.getUnreadCount(userId);

    res.json({
      success: true,
      data: {
        notifications: notifications,
        unreadCount: unreadCount,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error getting notifications",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: "Unread notifications count for header badge (Free & Premium)"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Số lượng notifications chưa đọc
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
 *                     unreadCount:
 *                       type: number
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */
router.get("/unread-count", requireAuth, async (req, res) => {
  try {
    const unreadCount = await Notification.getUnreadCount(req.user.id);

    res.json({
      success: true,
      data: {
        unreadCount: unreadCount,
      },
    });
  } catch (error) {
    console.error("Error getting unread count:", error);
    res.status(500).json({
      success: false,
      message: "Error getting unread count",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/notifications/{notificationId}/read:
 *   put:
 *     tags: [Notifications]
 *     summary: Đánh dấu notification đã đọc
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của notification
 *     responses:
 *       200:
 *         description: Đã đánh dấu đọc
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy notification
 *       500:
 *         description: Lỗi server
 */
router.put("/:notificationId/read", requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.notificationId,
      userId: req.user.id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    await notification.markAsRead();

    res.json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      message: "Error marking notification as read",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/notifications/mark-all-read:
 *   put:
 *     tags: [Notifications]
 *     summary: Đánh dấu tất cả notifications đã đọc
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đã đánh dấu tất cả đọc
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */
router.put("/mark-all-read", requireAuth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Error marking all notifications as read",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/notifications/{notificationId}:
 *   delete:
 *     tags: [Notifications]
 *     summary: Xóa notification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của notification
 *     responses:
 *       200:
 *         description: Đã xóa
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy notification
 *       500:
 *         description: Lỗi server
 */
router.delete("/:notificationId", requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.notificationId,
      userId: req.user.id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting notification",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/notifications/trigger-check:
 *   post:
 *     tags: [Notifications]
 *     summary: Manual trigger notification check (development only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification check completed
 *       404:
 *         description: Not available in production
 *       500:
 *         description: Lỗi server
 */
router.post("/trigger-check", requireAuth, async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({
        success: false,
        message: "Endpoint not available in production",
      });
    }

    await triggerNotificationCheck();

    res.json({
      success: true,
      message: "Notification check completed successfully",
    });
  } catch (error) {
    console.error("Error triggering notification check:", error);
    res.status(500).json({
      success: false,
      message: "Error triggering notification check",
      error: error.message,
    });
  }
});

module.exports = router;
