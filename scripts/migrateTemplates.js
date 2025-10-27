const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const JournalTemplate = require("../models/JournalTemplate");
const fs = require("fs");
const path = require("path");

// Connect to MongoDB
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/everquill"
);

async function migrateTemplates() {
  try {
    console.log("Starting template migration to Cloudinary...");

    // Find templates with local image paths
    const templates = await JournalTemplate.find({
      $or: [
        { imageUrl: { $regex: /^\/uploads\/templates\// } },
        { thumbnailUrl: { $regex: /^\/uploads\/templates\// } },
      ],
    });

    console.log(`Found ${templates.length} templates with local images`);

    for (const template of templates) {
      try {
        console.log(`Migrating template: ${template.name}...`);

        // Migrate main image
        if (
          template.imageUrl &&
          template.imageUrl.startsWith("/uploads/templates/")
        ) {
          const localPath = path.join(__dirname, "..", template.imageUrl);

          if (fs.existsSync(localPath)) {
            console.log(`  Uploading main image: ${template.imageUrl}`);

            const result = await cloudinary.uploader.upload(localPath, {
              folder: "everquill/templates",
              transformation: [
                { width: 800, height: 600, crop: "fill" },
                { quality: "auto" },
              ],
            });

            template.imageUrl = result.secure_url;
            console.log(`  ✅ Main image uploaded: ${result.secure_url}`);

            // Delete local file
            fs.unlinkSync(localPath);
            console.log(`  🗑️ Deleted local file: ${localPath}`);
          } else {
            console.log(`  ⚠️ Main image file not found: ${localPath}`);
            template.imageUrl = null;
          }
        }

        // Migrate thumbnail if different from main image
        if (
          template.thumbnailUrl &&
          template.thumbnailUrl.startsWith("/uploads/templates/") &&
          template.thumbnailUrl !== template.imageUrl
        ) {
          const localPath = path.join(__dirname, "..", template.thumbnailUrl);

          if (fs.existsSync(localPath)) {
            console.log(`  Uploading thumbnail: ${template.thumbnailUrl}`);

            const result = await cloudinary.uploader.upload(localPath, {
              folder: "everquill/templates",
              transformation: [
                { width: 400, height: 300, crop: "fill" },
                { quality: "auto" },
              ],
            });

            template.thumbnailUrl = result.secure_url;
            console.log(`  ✅ Thumbnail uploaded: ${result.secure_url}`);

            // Delete local file
            fs.unlinkSync(localPath);
            console.log(`  🗑️ Deleted local thumbnail: ${localPath}`);
          } else {
            console.log(`  ⚠️ Thumbnail file not found: ${localPath}`);
            template.thumbnailUrl = template.imageUrl; // Use main image as thumbnail
          }
        } else if (template.thumbnailUrl === template.imageUrl) {
          // If thumbnail was same as main image, update to new main image URL
          template.thumbnailUrl = template.imageUrl;
        }

        // Save updated template
        await template.save();
        console.log(`✅ Migrated template: ${template.name}`);
      } catch (error) {
        console.error(
          `❌ Error migrating template ${template.name}:`,
          error.message
        );
      }
    }

    console.log("✅ Template migration completed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run migration
migrateTemplates();

