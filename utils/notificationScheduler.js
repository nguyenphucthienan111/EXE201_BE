const User = require("../models/User");
const Notification = require("../models/Notification");

/**
 * Check for expiring premium subscriptions and create notifications
 * Run this daily via cron job or schedule
 */
const checkExpiringPremiumSubscriptions = async () => {
  try {
    console.log("🔍 Checking for expiring premium subscriptions...");

    // Find users with premium expiring in 7 days or less
    const expiringUsers = await User.findExpiringPremiumUsers(7);

    for (const user of expiringUsers) {
      const daysLeft = user.getPremiumDaysLeft();

      // Only create notifications for specific days (7, 5, 3, 1 days)
      if ([7, 5, 3, 1].includes(daysLeft)) {
        // Check if notification already exists for this user and day
        const existingNotification = await Notification.findOne({
          userId: user._id,
          type: "premium_expiring",
          "data.daysLeft": daysLeft,
          createdAt: {
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Created within last 24 hours
          },
        });

        if (!existingNotification) {
          // Create expiring notification
          await Notification.createPremiumExpiringNotification(
            user._id,
            daysLeft
          );
          console.log(
            `📨 Created expiring notification for ${user.email} (${daysLeft} days left)`
          );
        }
      }
    }

    // Find users with expired premium (today)
    const expiredUsers = await User.find({
      plan: "premium",
      premiumExpiresAt: {
        $lte: new Date(),
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired within last 24 hours
      },
    });

    for (const user of expiredUsers) {
      // Check if expiry notification already exists
      const existingExpiredNotification = await Notification.findOne({
        userId: user._id,
        type: "premium_expired",
        createdAt: {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });

      if (!existingExpiredNotification) {
        // Create expired notification
        await Notification.createPremiumExpiredNotification(user._id);

        // Downgrade user to free plan
        user.plan = "free";
        user.premiumExpiresAt = null;
        await user.save();

        console.log(
          `💔 Premium expired for ${user.email}, downgraded to free plan`
        );
      }
    }

    console.log(
      `✅ Notification scheduler completed. Processed ${expiringUsers.length} expiring and ${expiredUsers.length} expired users.`
    );
  } catch (error) {
    console.error("❌ Error in notification scheduler:", error);
  }
};

/**
 * Initialize notification scheduler
 * Call this once when server starts
 */
const initNotificationScheduler = () => {
  // Run immediately on startup
  checkExpiringPremiumSubscriptions();

  // Run every 24 hours (86400000 ms)
  setInterval(checkExpiringPremiumSubscriptions, 24 * 60 * 60 * 1000);

  // For testing: run every 5 minutes in development
  if (process.env.NODE_ENV === "development") {
    console.log(
      "🔧 Development mode: Running notification checker every 5 minutes"
    );
    setInterval(checkExpiringPremiumSubscriptions, 5 * 60 * 1000);
  }

  console.log("🚀 Notification scheduler initialized");
};

/**
 * Manual trigger for testing
 */
const triggerNotificationCheck = async () => {
  console.log("🔧 Manually triggering notification check...");
  await checkExpiringPremiumSubscriptions();
};

module.exports = {
  initNotificationScheduler,
  checkExpiringPremiumSubscriptions,
  triggerNotificationCheck,
};
