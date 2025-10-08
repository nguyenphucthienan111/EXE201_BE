const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: {
      validator: Number.isInteger,
      message: "Rating must be an integer between 1 and 5",
    },
  },
  feedback: {
    type: String,
    trim: true,
    maxLength: 1000,
    default: "",
  },
  // Review visibility (admin can hide inappropriate reviews)
  isVisible: {
    type: Boolean,
    default: true,
  },
  // Review metadata
  userAgent: {
    type: String,
    trim: true,
    default: "",
  },
  ipAddress: {
    type: String,
    trim: true,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure one review per user
reviewSchema.index({ userId: 1 }, { unique: true });

// Update updatedAt on save
reviewSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get review statistics
reviewSchema.statics.getReviewStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        visibleReviews: {
          $sum: { $cond: ["$isVisible", 1, 0] },
        },
        hiddenReviews: {
          $sum: { $cond: ["$isVisible", 0, 1] },
        },
        averageRating: { $avg: "$rating" },
      },
    },
  ]);

  // Get rating distribution
  const ratingDistribution = await this.aggregate([
    {
      $group: {
        _id: "$rating",
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  const result = stats[0] || {
    totalReviews: 0,
    visibleReviews: 0,
    hiddenReviews: 0,
    averageRating: 0,
  };

  // Add rating distribution
  result.ratingDistribution = {};
  ratingDistribution.forEach((item) => {
    result.ratingDistribution[item._id] = item.count;
  });

  return result;
};

// Static method to get visible reviews for public display
reviewSchema.statics.getVisibleReviews = function (limit = 10, skip = 0) {
  return this.find({ isVisible: true })
    .populate("userId", "name email")
    .select("rating feedback createdAt")
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

module.exports = mongoose.model("Review", reviewSchema);
