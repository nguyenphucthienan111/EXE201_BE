var mongoose = require("mongoose");
var bcrypt = require("bcryptjs");

var userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },
  name: { type: String },
  googleId: { type: String },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationCode: { type: String },
  resetPasswordCode: { type: String },
  plan: { type: String, enum: ["free", "premium"], default: "free" },
  premiumExpiresAt: { type: Date },
  premiumStartedAt: { type: Date },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  avatar: { type: String },
  pendingEmail: { type: String },
  createdAt: { type: Date, default: Date.now },
  refreshTokenHash: { type: String },
  refreshTokenExpiresAt: { type: Date },
  refreshTokenId: { type: String },
});

userSchema.methods.setRefreshToken = async function (
  secret,
  expiresAt,
  tokenId
) {
  const salt = await bcrypt.genSalt(10);
  this.refreshTokenHash = await bcrypt.hash(secret, salt);
  this.refreshTokenExpiresAt = expiresAt;
  this.refreshTokenId = tokenId;
};

userSchema.methods.clearRefreshToken = function () {
  this.refreshTokenHash = undefined;
  this.refreshTokenExpiresAt = undefined;
  this.refreshTokenId = undefined;
};

userSchema.methods.validateRefreshToken = async function (secret, tokenId) {
  if (!this.refreshTokenHash) return false;
  if (!this.refreshTokenId || this.refreshTokenId !== tokenId) return false;
  if (this.refreshTokenExpiresAt && this.refreshTokenExpiresAt < new Date())
    return false;
  return bcrypt.compare(secret, this.refreshTokenHash);
};

// Method to check if premium is active
userSchema.methods.isPremiumActive = function () {
  return (
    this.plan === "premium" &&
    this.premiumExpiresAt &&
    new Date() < this.premiumExpiresAt
  );
};

// Method to get days left of premium
userSchema.methods.getPremiumDaysLeft = function () {
  if (!this.isPremiumActive()) return 0;
  const now = new Date();
  const diffTime = this.premiumExpiresAt - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

// Method to check if premium is expiring soon (7 days or less)
userSchema.methods.isPremiumExpiringSoon = function () {
  return this.isPremiumActive() && this.getPremiumDaysLeft() <= 7;
};

// Method to upgrade to premium
userSchema.methods.upgradeToPremium = function (durationDays = 30) {
  this.plan = "premium";
  this.premiumStartedAt = new Date();
  this.premiumExpiresAt = new Date(
    Date.now() + durationDays * 24 * 60 * 60 * 1000
  );
};

// Static method to find users with expiring premium
userSchema.statics.findExpiringPremiumUsers = function (daysThreshold = 7) {
  const thresholdDate = new Date(
    Date.now() + daysThreshold * 24 * 60 * 60 * 1000
  );
  return this.find({
    plan: "premium",
    premiumExpiresAt: { $lte: thresholdDate, $gte: new Date() },
  });
};

// Method to check if user is admin
userSchema.methods.isAdmin = function () {
  return this.role === "admin";
};

// Static method to get premium statistics
userSchema.statics.getPremiumStats = async function () {
  const totalUsers = await this.countDocuments();
  const premiumUsers = await this.countDocuments({ plan: "premium" });
  const activePremiumUsers = await this.countDocuments({
    plan: "premium",
    premiumExpiresAt: { $gt: new Date() },
  });
  const expiringPremiumUsers = await this.countDocuments({
    plan: "premium",
    premiumExpiresAt: {
      $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      $gt: new Date(),
    },
  });

  return {
    totalUsers,
    premiumUsers,
    activePremiumUsers,
    expiringPremiumUsers,
    freeUsers: totalUsers - premiumUsers,
    premiumConversionRate:
      totalUsers > 0 ? ((premiumUsers / totalUsers) * 100).toFixed(2) : 0,
  };
};

module.exports = mongoose.model("User", userSchema);
