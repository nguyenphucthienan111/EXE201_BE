var mongoose = require("mongoose");

var aiAnalysisSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  journalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Journal",
    default: null,
  },
  analysisType: {
    type: String,
    enum: ["emotion", "mental_health"],
    required: true,
  },
  content: {
    type: String,
    required: true,
    maxLength: 10000,
  },
  results: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  aiPowered: {
    type: Boolean,
    default: true,
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

// Index for better query performance
aiAnalysisSchema.index({ userId: 1, createdAt: -1 });
aiAnalysisSchema.index({ userId: 1, analysisType: 1 });
aiAnalysisSchema.index({ journalId: 1 });

// Pre-save middleware
aiAnalysisSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Static methods
aiAnalysisSchema.statics.getUserAnalysisHistory = function (
  userId,
  analysisType = null,
  limit = 20,
  skip = 0
) {
  const query = { userId };
  if (analysisType) {
    query.analysisType = analysisType;
  }

  return this.find(query)
    .populate("journalId", "title createdAt")
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

aiAnalysisSchema.statics.getAnalysisStats = function (userId) {
  return this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: "$analysisType",
        count: { $sum: 1 },
        lastAnalysis: { $max: "$createdAt" },
      },
    },
  ]);
};

aiAnalysisSchema.statics.getRecentAnalysis = function (userId, limit = 5) {
  return this.find({ userId })
    .populate("journalId", "title createdAt")
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("analysisType results createdAt aiPowered");
};

module.exports = mongoose.model("AIAnalysis", aiAnalysisSchema);
