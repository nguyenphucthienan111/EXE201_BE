var mongoose = require("mongoose");

var paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  orderId: { type: String, required: true, unique: true },
  payosOrderId: { type: String, required: true },
  amount: { type: Number, required: true },
  paymentType: {
    type: String,
    enum: ["premium_subscription", "other"],
    default: "premium_subscription",
  },
  status: {
    type: String,
    enum: ["pending", "success", "failed", "cancelled"],
    default: "pending",
  },
  paymentUrl: { type: String },
  description: { type: String },
  transactionId: { type: String },
  paidAt: { type: Date },
  cancelledAt: { type: Date },
  paymentTimeout: { type: Date },
  isExpired: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Method to check if payment has expired
paymentSchema.methods.isPaymentExpired = function () {
  return this.paymentTimeout && new Date() > this.paymentTimeout;
};

// Pre-save middleware to set payment timeout (2 minutes for premium payments)
paymentSchema.pre("save", function (next) {
  if (this.isNew && !this.paymentTimeout) {
    this.paymentTimeout = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes
  }
  next();
});

// Static method to mark expired payments
paymentSchema.statics.markExpiredPayments = async function () {
  const now = new Date();
  const result = await this.updateMany(
    {
      status: "pending",
      paymentTimeout: { $lt: now },
      isExpired: { $ne: true },
    },
    {
      status: "failed",
      isExpired: true,
      cancelledAt: now,
    }
  );
  console.log(`Marked ${result.modifiedCount} payments as expired`);
  return result;
};

module.exports = mongoose.model("Payment", paymentSchema);
