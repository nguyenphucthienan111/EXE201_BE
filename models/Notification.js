var mongoose = require("mongoose");

var notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: {
    type: String,
    enum: [
      "premium_upgrade",
      "premium_expiring",
      "premium_expired",
      "payment_success",
      "payment_failed",
    ],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  data: { type: mongoose.Schema.Types.Mixed }, // Additional data (payment info, etc.)
  createdAt: { type: Date, default: Date.now },
  readAt: { type: Date },
});

// Index for efficient queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// Method to mark as read
notificationSchema.methods.markAsRead = function () {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to create premium upgrade notification
notificationSchema.statics.createPremiumUpgradeNotification = function (
  userId,
  paymentAmount,
  expiresAt
) {
  return this.create({
    userId: userId,
    type: "premium_upgrade",
    title: "🎉 Premium Upgrade Successful!",
    message: `Your premium subscription has been activated successfully. Enjoy premium features until ${expiresAt.toLocaleDateString()}.`,
    data: {
      paymentAmount: paymentAmount,
      expiresAt: expiresAt,
    },
  });
};

// Static method to create premium expiring notification
notificationSchema.statics.createPremiumExpiringNotification = function (
  userId,
  daysLeft
) {
  const emoji = daysLeft <= 3 ? "🚨" : "⏰";
  return this.create({
    userId: userId,
    type: "premium_expiring",
    title: `${emoji} Premium Expiring Soon`,
    message: `Your premium subscription will expire in ${daysLeft} day${
      daysLeft > 1 ? "s" : ""
    }. Renew now to continue enjoying premium features.`,
    data: {
      daysLeft: daysLeft,
    },
  });
};

// Static method to create premium expired notification
notificationSchema.statics.createPremiumExpiredNotification = function (
  userId
) {
  return this.create({
    userId: userId,
    type: "premium_expired",
    title: "😔 Premium Subscription Expired",
    message:
      "Your premium subscription has expired. Upgrade again to access premium features.",
    data: {},
  });
};

// Static method to get unread count for user
notificationSchema.statics.getUnreadCount = function (userId) {
  return this.countDocuments({ userId: userId, isRead: false });
};

module.exports = mongoose.model("Notification", notificationSchema);
