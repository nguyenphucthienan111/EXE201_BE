require("dotenv").config();
const mongoose = require("mongoose");
const Journal = require("../models/Journal");
const {
  hasEncryptionConfig,
  encryptValue,
  isProbablyEncrypted,
} = require("../utils/encryption");

async function migrateJournals() {
  if (!hasEncryptionConfig()) {
    console.error(
      "[JOURNAL ENCRYPTION] Cannot encrypt existing journals because JOURNAL_ENCRYPTION_KEY/IV are not configured."
    );
    process.exit(1);
  }

  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGO_URI_EXEC ||
    process.env.DB_URI ||
    process.env.DATABASE_URL;
  if (!mongoUri) {
    console.error("MONGO_URI not defined. Aborting migration.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("[JOURNAL ENCRYPTION] Connected to MongoDB");

  const cursor = Journal.find().cursor();
  let processed = 0;
  let encrypted = 0;

  for await (const journal of cursor) {
    processed += 1;

    let changed = false;

    let updated = false;

    if (journal.title && !isProbablyEncrypted(journal.title)) {
      journal.title = encryptValue(journal.title);
      updated = true;
    }
    if (journal.content && !isProbablyEncrypted(journal.content)) {
      journal.content = encryptValue(journal.content);
      updated = true;
    }
    if (journal.richContent && !isProbablyEncrypted(journal.richContent)) {
      journal.richContent = encryptValue(journal.richContent);
      updated = true;
    }
    if (journal.mood && !isProbablyEncrypted(journal.mood)) {
      journal.mood = encryptValue(String(journal.mood));
      updated = true;
    }
    if (Array.isArray(journal.tags)) {
      const newTags = journal.tags.map((tag) =>
        tag && !isProbablyEncrypted(tag) ? encryptValue(String(tag)) : tag
      );
      if (JSON.stringify(newTags) !== JSON.stringify(journal.tags)) {
        journal.tags = newTags;
        updated = true;
      }
    }

    if (!updated) continue;

    try {
      await Journal.updateOne(
        { _id: journal._id },
        {
          $set: {
            title: journal.title,
            content: journal.content,
            richContent: journal.richContent,
            mood: journal.mood,
            tags: journal.tags,
          },
        }
      );
      encrypted += 1;
    } catch (err) {
      console.error(
        `[JOURNAL ENCRYPTION] Failed to encrypt journal ${journal._id}:`,
        err.message
      );
    }
  }

  await mongoose.disconnect();
  console.log(
    `[JOURNAL ENCRYPTION] Migration complete. Processed ${processed}, encrypted ${encrypted}.`
  );
  process.exit(0);
}

migrateJournals().catch((err) => {
  console.error("[JOURNAL ENCRYPTION] Migration failed:", err);
  process.exit(1);
});
