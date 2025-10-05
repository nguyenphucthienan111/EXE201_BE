const { requireAuth } = require("./auth");
const User = require("../models/User");

/**
 * Middleware to check if user is admin
 * Must be used after requireAuth middleware
 */
const requireAdmin = async (req, res, next) => {
  try {
    // Get user from database to check role
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isAdmin()) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
      });
    }

    // Add user info to request for convenience
    req.user.role = user.role;
    req.user.plan = user.plan;

    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying admin privileges",
      error: error.message,
    });
  }
};

/**
 * Combined middleware: require authentication + admin role
 */
const requireAdminAuth = [requireAuth, requireAdmin];

module.exports = {
  requireAdmin,
  requireAdminAuth,
};
