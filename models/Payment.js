const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true,
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "completed", "failed", "expired"],
    default: "pending",
  },
  paymentMethod: { type: String, default: "PayOS" },
  paymentUrl: { type: String },
  paymentTimeout: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Check if the payment is expired
paymentSchema.methods.isPaymentExpired = function () {
  if (!this.paymentTimeout) return false;
  return Date.now() > this.paymentTimeout.getTime();
};

// Mark payment as expired
paymentSchema.methods.markAsExpired = async function () {
  if (this.isPaymentExpired() && this.status === "pending") {
    this.status = "expired";
    await this.save();
  }
};

module.exports = mongoose.model("Payment", paymentSchema);
