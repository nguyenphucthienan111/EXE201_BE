var mongoose = require("mongoose");

var journalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String },
  content: { type: String, default: "" },
  mood: { type: String },
  tags: [{ type: String }],
  suggestion: { type: String }, // Gợi ý nội dung cho premium
  cloudSynced: { type: Boolean, default: false }, // Đồng bộ đám mây cho premium
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

journalSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("Journal", journalSchema);
