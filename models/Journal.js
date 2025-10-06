var mongoose = require("mongoose");

var journalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String },
  content: { type: String, default: "" },
  // Rich text content support
  richContent: {
    type: String, // HTML content for rich text editor
    default: "",
  },
  // Template information
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "JournalTemplate",
    default: null,
  },
  templateName: {
    type: String,
    default: "Default",
  },
  // Mood and metadata
  mood: { type: String },
  tags: [{ type: String }],
  suggestion: { type: String }, // Gợi ý nội dung cho premium
  cloudSynced: { type: Boolean, default: false }, // Đồng bộ đám mây cho premium
  // Print settings (stored per journal)
  printSettings: {
    paperSize: { type: String, default: "A4" },
    printQuality: { type: String, default: "Standard" },
    colorOptions: { type: String, default: "Color" },
    copies: { type: Number, default: 1 },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

journalSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("Journal", journalSchema);
