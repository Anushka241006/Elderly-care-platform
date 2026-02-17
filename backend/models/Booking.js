const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    patientName: {
      type: String,
      required: true
    },
    patientAge: {
      type: Number,
      required: true
    },
    medicalNeeds: {
      type: String,
      default: ""
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true
    },
    caregiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    scheduleDate: {
      type: Date,
      required: true
    },
    planType: {
      type: String,
      enum: ["hourly", "daily", "long-term"],
      default: "daily"
    },
    bookingAmount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "in-progress", "completed", "rejected"],
      default: "pending"
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid"
    },
    paymentMethod: {
      type: String,
      enum: ["none", "upi", "card", "netbanking", "cash"],
      default: "none"
    },
    paidAt: {
      type: Date,
      default: null
    },
    transactionId: {
      type: String,
      default: ""
    },
    careNotes: {
      type: String,
      default: ""
    },
    userRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    userReview: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
