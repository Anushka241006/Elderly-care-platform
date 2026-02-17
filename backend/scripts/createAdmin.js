const mongoose = require("mongoose");
const User = require("../models/User");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/elderlyCare";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@care24.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";
const ADMIN_NAME = process.env.ADMIN_NAME || "Platform Admin";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);

    let admin = await User.findOne({ email: ADMIN_EMAIL });
    if (!admin) {
      admin = await User.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: "admin",
        verified: true
      });
      console.log(`Admin created: ${admin.email}`);
      return;
    }

    admin.name = ADMIN_NAME;
    admin.role = "admin";
    admin.verified = true;
    admin.password = ADMIN_PASSWORD;
    await admin.save();
    console.log(`Admin updated: ${admin.email}`);
  } catch (error) {
    console.error("Failed to create/update admin:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
