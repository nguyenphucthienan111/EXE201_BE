var mongoose = require("mongoose");
var {
  encryptValue,
  decryptValue,
  hasEncryptionConfig,
  isProbablyEncrypted,
} = require("../utils/encryption");

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
  if (hasEncryptionConfig()) {
    if (
      this.isModified("title") &&
      this.title &&
      !isProbablyEncrypted(this.title)
    ) {
      this.title = encryptValue(this.title);
    }
    if (
      this.isModified("content") &&
      this.content &&
      !isProbablyEncrypted(this.content)
    ) {
      this.content = encryptValue(this.content);
    }
    if (
      this.isModified("richContent") &&
      this.richContent &&
      !isProbablyEncrypted(this.richContent)
    ) {
      this.richContent = encryptValue(this.richContent);
    }
    if (
      this.isModified("mood") &&
      this.mood &&
      !isProbablyEncrypted(this.mood)
    ) {
      this.mood = encryptValue(String(this.mood));
    }
    if (Array.isArray(this.tags)) {
      this.tags = this.tags.map((tag) =>
        tag && !isProbablyEncrypted(tag) ? encryptValue(String(tag)) : tag
      );
    }
  }
  next();
});

journalSchema.pre("findOneAndUpdate", function (next) {
  if (!hasEncryptionConfig()) return next();

  const update = this.getUpdate() || {};
  const target = update.$set || update;

  if (target.title && !isProbablyEncrypted(target.title)) {
    target.title = encryptValue(target.title);
  }
  if (target.content && !isProbablyEncrypted(target.content)) {
    target.content = encryptValue(target.content);
  }
  if (target.richContent && !isProbablyEncrypted(target.richContent)) {
    target.richContent = encryptValue(target.richContent);
  }
  if (target.mood && !isProbablyEncrypted(target.mood)) {
    target.mood = encryptValue(String(target.mood));
  }
  if (Array.isArray(target.tags)) {
    target.tags = target.tags.map((tag) =>
      tag && !isProbablyEncrypted(tag) ? encryptValue(String(tag)) : tag
    );
  }

  if (!update.$set) {
    this.setUpdate(target);
  }

  next();
});

journalSchema.post("init", function (doc) {
  if (hasEncryptionConfig()) {
    if (doc.title) doc.title = decryptValue(doc.title);
    if (doc.content) doc.content = decryptValue(doc.content);
    if (doc.richContent) doc.richContent = decryptValue(doc.richContent);
    if (doc.mood) doc.mood = decryptValue(doc.mood);
    if (Array.isArray(doc.tags)) {
      doc.tags = doc.tags.map((tag) => (tag ? decryptValue(String(tag)) : tag));
    }
  }
});

module.exports = mongoose.model("Journal", journalSchema);
