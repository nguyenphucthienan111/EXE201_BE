var mongoose = require("mongoose");

var userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },
  name: { type: String },
  googleId: { type: String },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationCode: { type: String },
  resetPasswordCode: { type: String },
  refreshToken: { type: String },
  plan: { type: String, enum: ["free", "premium"], default: "free" },
  premiumExpiresAt: { type: Date },
  premiumStartedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

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

module.exports = mongoose.model("User", userSchema);
