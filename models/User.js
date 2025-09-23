var mongoose = require("mongoose");

var userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },
  name: { type: String },
  googleId: { type: String },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationCode: { type: String },
  plan: { type: String, enum: ["free", "premium"], default: "free" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
