const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ["user", "caregiver", "admin"],
    default: "user"
  },
  verified: {
    type: Boolean,
    default: false
  },
  qualifications: {
    type: String,
    default: ""
  },
  serviceArea: {
    type: String,
    default: ""
  },
  availability: {
    type: String,
    default: "Full-time"
  },
  resetPasswordToken: {
    type: String,
    default: ""
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  }
});

// Automatically encrypt password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Used during login
userSchema.methods.comparePassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
