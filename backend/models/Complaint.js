const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    caregiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    category: {
      type: String,
      enum: ["quality", "delay", "behavior", "billing", "other"],
      default: "other"
    },
    message: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["open", "in-review", "resolved", "rejected"],
      default: "open"
    },
    resolutionNote: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Complaint", complaintSchema);
