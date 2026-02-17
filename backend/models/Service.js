const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true
    },
    description: {
      type: String,
      required: true
    },
    duration: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    requiredQualification: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Service", serviceSchema);
