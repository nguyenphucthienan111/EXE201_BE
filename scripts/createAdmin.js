const mongoose = require("mongoose");
const User = require("../models/User");
require("dotenv").config();

const createAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      console.log("ℹ️ Admin user already exists:");
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.name}`);
      console.log(`   Role: ${existingAdmin.role}`);
      return;
    }

    // Create admin user
    const adminEmail = process.env.ADMIN_EMAIL || "admin@everquill.com";
    const adminName = process.env.ADMIN_NAME || "Admin User";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

    // Hash password
    const bcrypt = require("bcryptjs");
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    const adminUser = new User({
      email: adminEmail,
      passwordHash: passwordHash,
      name: adminName,
      role: "admin",
      plan: "premium", // Admin gets premium by default
      isEmailVerified: true,
    });

    await adminUser.save();

    console.log("🎉 Admin user created successfully:");
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Name: ${adminName}`);
    console.log(`   Role: admin`);
    console.log(`   Plan: premium`);
    console.log("");
    console.log("⚠️ IMPORTANT: Change the default password after first login!");
  } catch (error) {
    console.error("❌ Error creating admin user:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("📡 Disconnected from MongoDB");
  }
};

// Run the script
createAdminUser();
