const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const User = require("../models/User");
const fs = require("fs");
const path = require("path");

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

async function migrateAvatars() {
  try {
    console.log("Starting avatar migration to Cloudinary...");

    // Find users with local avatar paths
    const users = await User.find({
      avatar: { $regex: /^\/uploads\/avatars\// },
    });

    console.log(`Found ${users.length} users with local avatars`);

    for (const user of users) {
      try {
        const localPath = path.join(__dirname, "..", user.avatar);

        // Check if file exists
        if (fs.existsSync(localPath)) {
          console.log(`Migrating avatar for user ${user.email}...`);

          // Upload to Cloudinary
          const result = await cloudinary.uploader.upload(localPath, {
            folder: "everquill/avatars",
            transformation: [
              { width: 500, height: 500, crop: "fill", gravity: "face" },
              { quality: "auto" },
            ],
          });

          // Update user with Cloudinary URL
          user.avatar = result.secure_url;
          await user.save();

          console.log(`✅ Migrated: ${user.email} -> ${result.secure_url}`);

          // Delete local file
          fs.unlinkSync(localPath);
          console.log(`🗑️ Deleted local file: ${localPath}`);
        } else {
          console.log(`⚠️ File not found: ${localPath}`);
          // Clear avatar if file doesn't exist
          user.avatar = null;
          await user.save();
        }
      } catch (error) {
        console.error(`❌ Error migrating user ${user.email}:`, error.message);
      }
    }

    console.log("✅ Avatar migration completed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run migration
migrateAvatars();
