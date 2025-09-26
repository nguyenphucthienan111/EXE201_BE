var mongoose = require("mongoose");

var usageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  basicSuggestionsUsed: { type: Number, default: 0 },
  createdJournals: { type: Number, default: 0 },
});

usageSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Usage", usageSchema);
