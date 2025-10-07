const mongoose = require("mongoose");

const journalTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: "A beautiful journal template",
  },
  category: {
    type: String,
    enum: ["default", "premium", "user"],
    default: "default",
  },
  imageUrl: {
    type: String,
    required: true,
  },
  thumbnailUrl: {
    type: String,
    required: true,
  },
  // For user-uploaded templates
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null, // null for admin-uploaded templates
  },
  // Template metadata
  tags: [
    {
      type: String,
      trim: true,
    },
  ],
  isActive: {
    type: Boolean,
    default: true,
  },
  // Usage statistics
  usageCount: {
    type: Number,
    default: 0,
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

// Update updatedAt on save
journalTemplateSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get templates available for user
journalTemplateSchema.statics.getAvailableTemplates = function (
  userPlan,
  userId
) {
  let query = { isActive: true };

  if (userPlan === "free") {
    // Free users can only use default templates
    query.category = "default";
  } else if (userPlan === "premium") {
    // Premium users can use default, premium, and their own templates
    query.$or = [
      { category: "default" },
      { category: "premium" },
      { category: "user", uploadedBy: userId },
    ];
  }

  return this.find(query).sort({ category: 1, usageCount: -1 });
};

// Static method to increment usage count
journalTemplateSchema.statics.incrementUsage = function (templateId) {
  return this.findByIdAndUpdate(
    templateId,
    { $inc: { usageCount: 1 } },
    { new: true }
  );
};

module.exports = mongoose.model("JournalTemplate", journalTemplateSchema);



