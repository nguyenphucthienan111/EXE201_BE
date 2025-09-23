var mongoose = require("mongoose");

var moodSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: String, required: true },
  mood: { type: String, required: true },
  score: { type: Number, min: 1, max: 10 },
  notes: { type: String },
  analysis: { type: String }, // Kết quả phân tích tâm trạng cho premium
});

module.exports = mongoose.model("Mood", moodSchema);
