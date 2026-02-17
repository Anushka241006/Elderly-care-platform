try {
  require("dotenv").config();
} catch (error) {
  // Allow app to run even if dotenv is not installed yet.
}

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("./models/User");
const Service = require("./models/Service");
const Booking = require("./models/Booking");
const Patient = require("./models/Patient");
const Complaint = require("./models/Complaint");
const Notification = require("./models/Notification");

const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || "elderly-care-platform-secret";
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/elderlyCare";
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@care24.com";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";
const DEFAULT_ADMIN_NAME = process.env.ADMIN_NAME || "Platform Admin";
const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 15);

const seedServices = [
  {
    name: "Nursing Care",
    description: "Professional at-home nursing support for elderly patients.",
    duration: "2-12 hours/session",
    price: 899,
    requiredQualification: "Registered Nurse"
  },
  {
    name: "Elderly Attendant",
    description: "Daily living assistance, mobility support, and companionship.",
    duration: "4-24 hours/session",
    price: 599,
    requiredQualification: "Geriatric Care Training"
  },
  {
    name: "Physiotherapy",
    description: "Personalized rehabilitation and pain management sessions.",
    duration: "45-90 minutes/session",
    price: 799,
    requiredQualification: "Licensed Physiotherapist"
  },
  {
    name: "Post-Hospital Care",
    description: "Structured recovery care after hospital discharge.",
    duration: "1-4 weeks",
    price: 1299,
    requiredQualification: "Critical Care / Recovery Experience"
  }
];

function getPlanMultiplier(planType) {
  if (planType === "hourly") return 1;
  if (planType === "daily") return 2;
  if (planType === "long-term") return 10;
  return 2;
}

function calculateBookingAmount(servicePrice, planType) {
  return Math.round(Number(servicePrice) * getPlanMultiplier(planType));
}

function buildInvoiceId(bookingId) {
  const suffix = bookingId.toString().slice(-6).toUpperCase();
  return `INV-${new Date().getFullYear()}-${suffix}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createNotification(userId, title, message) {
  await Notification.create({ user: userId, title, message });
}

async function notifyAdmins(title, message) {
  const admins = await User.find({ role: "admin" }, "_id");
  await Promise.all(admins.map((admin) => createNotification(admin._id, title, message)));
}

async function ensureDefaultData() {
  const serviceCount = await Service.countDocuments();
  if (serviceCount === 0) {
    await Service.insertMany(seedServices);
  }

  const adminByEmail = await User.findOne({ email: DEFAULT_ADMIN_EMAIL.toLowerCase() });

  if (!adminByEmail) {
    await User.create({
      name: DEFAULT_ADMIN_NAME,
      email: DEFAULT_ADMIN_EMAIL.toLowerCase(),
      password: DEFAULT_ADMIN_PASSWORD,
      role: "admin",
      verified: true
    });
    return;
  }

  let shouldSave = false;
  if (adminByEmail.role !== "admin") {
    adminByEmail.role = "admin";
    shouldSave = true;
  }
  if (!adminByEmail.verified) {
    adminByEmail.verified = true;
    shouldSave = true;
  }
  if (adminByEmail.name !== DEFAULT_ADMIN_NAME) {
    adminByEmail.name = DEFAULT_ADMIN_NAME;
    shouldSave = true;
  }

  const hasDefaultPassword = await adminByEmail.comparePassword(DEFAULT_ADMIN_PASSWORD);
  if (!hasDefaultPassword) {
    adminByEmail.password = DEFAULT_ADMIN_PASSWORD;
    shouldSave = true;
  }

  if (shouldSave) {
    await adminByEmail.save();
  }
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (!token) {
    return res.status(401).json({ message: "Authentication token missing" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
}

async function getCaregiverRatingsMap() {
  const rows = await Booking.aggregate([
    { $match: { userRating: { $gte: 1 } } },
    {
      $group: {
        _id: "$caregiver",
        averageRating: { $avg: "$userRating" },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  const ratingMap = new Map();
  rows.forEach((row) => {
    ratingMap.set(String(row._id), {
      averageRating: Number(row.averageRating.toFixed(1)),
      reviewCount: row.reviewCount
    });
  });
  return ratingMap;
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cors());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        role,
        qualifications = "",
        serviceArea = "",
        availability = "Full-time"
      } = req.body;

      if (!name || !email || !password || !role) {
        return res.status(400).json({ message: "All required fields are mandatory" });
      }

      if (!["user", "caregiver"].includes(role)) {
        return res.status(400).json({ message: "Invalid role selected" });
      }

      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(409).json({ message: "Email is already registered" });
      }

      const createdUser = await User.create({
        name,
        email: email.toLowerCase(),
        password,
        role,
        qualifications: role === "caregiver" ? qualifications : "",
        serviceArea: role === "caregiver" ? serviceArea : "",
        availability: role === "caregiver" ? availability : "Full-time",
        verified: role !== "caregiver"
      });

      if (role === "caregiver") {
        await notifyAdmins(
          "New caregiver pending verification",
          `${createdUser.name} registered and requires verification.`
        );
      }

      res.status(201).json({
        message:
          role === "caregiver"
            ? "Registration successful. Awaiting admin verification."
            : "Registration successful",
        userId: createdUser._id
      });
    } catch (error) {
      res.status(500).json({ message: "Server error while registering user" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email: (email || "").toLowerCase() });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isValid = await user.comparePassword(password || "");
      if (!isValid) {
        return res.status(401).json({ message: "Invalid password" });
      }

      if (user.role === "caregiver" && !user.verified) {
        return res.status(403).json({ message: "Caregiver account is pending admin verification" });
      }

      const token = jwt.sign(
        { id: user._id.toString(), role: user.role, name: user.name },
        JWT_SECRET,
        { expiresIn: "1d" }
      );

      res.json({
        message: "Login successful",
        token,
        role: user.role,
        name: user.name
      });
    } catch (error) {
      res.status(500).json({ message: "Server error while logging in" });
    }
  });

  app.post("/api/auth/request-reset", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.json({ message: "If this email is registered, reset instructions were generated." });
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      user.resetPasswordToken = hashToken(rawToken);
      user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      await user.save();

      return res.json({
        message: "Reset token generated. Use it to set a new password.",
        resetToken: rawToken,
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES
      });
    } catch (error) {
      return res.status(500).json({ message: "Failed to generate reset token" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const user = await User.findOne({
        resetPasswordToken: hashToken(token),
        resetPasswordExpires: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      user.password = newPassword;
      user.resetPasswordToken = "";
      user.resetPasswordExpires = null;
      await user.save();

      return res.json({ message: "Password reset successful. Please login." });
    } catch (error) {
      return res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.get("/api/services", async (req, res) => {
    try {
      const services = await Service.find().sort({ name: 1 });
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Failed to load services" });
    }
  });

  app.get("/api/caregivers", async (req, res) => {
    try {
      const caregivers = await User.find(
        { role: "caregiver", verified: true },
        "name qualifications serviceArea availability verified"
      ).sort({ createdAt: -1 });

      const ratingMap = await getCaregiverRatingsMap();
      const enriched = caregivers.map((caregiver) => {
        const rating = ratingMap.get(String(caregiver._id)) || { averageRating: 0, reviewCount: 0 };
        return {
          ...caregiver.toObject(),
          averageRating: rating.averageRating,
          reviewCount: rating.reviewCount
        };
      });

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to load caregivers" });
    }
  });

  app.post("/api/patients", authRequired, requireRole(["user", "admin"]), async (req, res) => {
    try {
      const { name, age, medicalNeeds = "" } = req.body;
      if (!name || !age) {
        return res.status(400).json({ message: "Patient name and age are required" });
      }

      const patient = await Patient.create({
        user: req.user.id,
        name,
        age,
        medicalNeeds
      });

      res.status(201).json({ message: "Patient profile saved", patient });
    } catch (error) {
      res.status(500).json({ message: "Failed to save patient profile" });
    }
  });

  app.get("/api/patients/me", authRequired, requireRole(["user", "admin"]), async (req, res) => {
    try {
      const patients = await Patient.find({ user: req.user.id }).sort({ createdAt: -1 });
      res.json(patients);
    } catch (error) {
      res.status(500).json({ message: "Failed to load patient profiles" });
    }
  });

  app.post("/api/bookings", authRequired, requireRole(["user", "admin"]), async (req, res) => {
    try {
      const {
        patientName,
        patientAge,
        medicalNeeds,
        serviceId,
        caregiverId,
        scheduleDate,
        planType
      } = req.body;

      if (!patientName || !patientAge || !serviceId || !caregiverId || !scheduleDate) {
        return res.status(400).json({ message: "Please complete all required fields" });
      }

      const service = await Service.findById(serviceId);
      const caregiver = await User.findOne({ _id: caregiverId, role: "caregiver", verified: true });

      if (!service || !caregiver) {
        return res.status(404).json({ message: "Selected service/caregiver not found" });
      }

      const normalizedPlan = planType || "daily";
      const bookingAmount = calculateBookingAmount(service.price, normalizedPlan);

      const booking = await Booking.create({
        user: req.user.id,
        patientName,
        patientAge,
        medicalNeeds: medicalNeeds || "",
        service: service._id,
        caregiver: caregiver._id,
        scheduleDate,
        planType: normalizedPlan,
        bookingAmount
      });

      await createNotification(
        caregiver._id,
        "New service request",
        `You received a new ${service.name} booking request.`
      );

      res.status(201).json({
        message: "Booking request created successfully",
        bookingId: booking._id,
        amount: bookingAmount
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  app.post("/api/bookings/:id/pay", authRequired, requireRole(["user", "admin"]), async (req, res) => {
    try {
      const { paymentMethod = "upi" } = req.body;
      if (!["upi", "card", "netbanking", "cash"].includes(paymentMethod)) {
        return res.status(400).json({ message: "Invalid payment method" });
      }

      const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, user: req.user.id };
      const booking = await Booking.findOne(filter);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (booking.paymentStatus === "paid") {
        return res.status(400).json({ message: "Booking is already paid" });
      }

      booking.paymentStatus = "paid";
      booking.paymentMethod = paymentMethod;
      booking.paidAt = new Date();
      booking.transactionId = `TXN-${Date.now()}-${booking._id.toString().slice(-4)}`;
      await booking.save();

      await createNotification(
        booking.caregiver,
        "Booking payment completed",
        `Payment is completed for booking ${booking._id.toString().slice(-6)}.`
      );

      res.json({
        message: "Payment successful",
        bookingId: booking._id,
        transactionId: booking.transactionId,
        amount: booking.bookingAmount
      });
    } catch (error) {
      res.status(500).json({ message: "Payment processing failed" });
    }
  });

  app.get("/api/bookings/:id/invoice", authRequired, requireRole(["user", "admin"]), async (req, res) => {
    try {
      const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, user: req.user.id };
      const booking = await Booking.findOne(filter)
        .populate("service", "name price")
        .populate("caregiver", "name")
        .populate("user", "name email");

      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (booking.paymentStatus !== "paid") {
        return res.status(400).json({ message: "Please complete payment before invoice" });
      }

      res.json({
        invoiceId: buildInvoiceId(booking._id),
        issuedAt: booking.paidAt,
        transactionId: booking.transactionId,
        customerName: booking.user?.name || "-",
        customerEmail: booking.user?.email || "-",
        patientName: booking.patientName,
        patientAge: booking.patientAge,
        serviceName: booking.service?.name || "-",
        caregiverName: booking.caregiver?.name || "-",
        planType: booking.planType,
        scheduleDate: booking.scheduleDate,
        amount: booking.bookingAmount,
        paymentMethod: booking.paymentMethod
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  app.post("/api/bookings/:id/review", authRequired, requireRole(["user", "admin"]), async (req, res) => {
    try {
      const { rating, review = "" } = req.body;
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }

      const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, user: req.user.id };
      const booking = await Booking.findOne(filter);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (booking.status !== "completed") {
        return res.status(400).json({ message: "Review can be added only after completion" });
      }

      booking.userRating = Number(rating);
      booking.userReview = review;
      await booking.save();

      await createNotification(
        booking.caregiver,
        "New caregiver rating",
        `You received ${rating}/5 rating for a completed booking.`
      );

      res.json({ message: "Review submitted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to submit review" });
    }
  });

  app.get("/api/bookings/me", authRequired, requireRole(["user", "admin"]), async (req, res) => {
    try {
      const bookings = await Booking.find({ user: req.user.id })
        .populate("service", "name price")
        .populate("caregiver", "name qualifications serviceArea")
        .sort({ createdAt: -1 });

      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Failed to load your bookings" });
    }
  });

  app.get("/api/bookings/caregiver", authRequired, requireRole(["caregiver"]), async (req, res) => {
    try {
      const bookings = await Booking.find({ caregiver: req.user.id })
        .populate("service", "name price")
        .populate("user", "name email")
        .sort({ createdAt: -1 });

      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Failed to load caregiver bookings" });
    }
  });

  app.patch("/api/bookings/:id/status", authRequired, requireRole(["caregiver", "admin"]), async (req, res) => {
    try {
      const { status, careNotes = "" } = req.body;
      const allowedStatuses = ["accepted", "in-progress", "completed", "rejected"];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status update" });
      }

      const filter = req.user.role === "caregiver" ? { _id: req.params.id, caregiver: req.user.id } : { _id: req.params.id };
      const booking = await Booking.findOne(filter);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      booking.status = status;
      booking.careNotes = careNotes;
      await booking.save();

      await createNotification(
        booking.user,
        "Booking status updated",
        `Your booking status is now '${status}'.`
      );

      res.json({ message: "Booking status updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update booking status" });
    }
  });

  app.get("/api/caregiver/earnings", authRequired, requireRole(["caregiver"]), async (req, res) => {
    try {
      const completedBookings = await Booking.find({ caregiver: req.user.id, status: "completed" });
      const grossEarnings = completedBookings.reduce((sum, booking) => sum + booking.bookingAmount, 0);
      const platformFee = Math.round(grossEarnings * 0.15);
      const netEarnings = grossEarnings - platformFee;

      res.json({
        completedServices: completedBookings.length,
        grossEarnings,
        platformFee,
        netEarnings
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to load caregiver earnings" });
    }
  });

  app.patch("/api/caregiver/profile", authRequired, requireRole(["caregiver"]), async (req, res) => {
    try {
      const { qualifications = "", serviceArea = "", availability = "" } = req.body;
      const caregiver = await User.findById(req.user.id);
      if (!caregiver) {
        return res.status(404).json({ message: "Caregiver not found" });
      }

      caregiver.qualifications = qualifications || caregiver.qualifications;
      caregiver.serviceArea = serviceArea || caregiver.serviceArea;
      caregiver.availability = availability || caregiver.availability;
      await caregiver.save();

      res.json({ message: "Caregiver profile updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update caregiver profile" });
    }
  });

  app.post("/api/complaints", authRequired, requireRole(["user", "admin"]), async (req, res) => {
    try {
      const { bookingId, category = "other", message } = req.body;
      if (!bookingId || !message) {
        return res.status(400).json({ message: "Booking and complaint message are required" });
      }

      const booking = await Booking.findOne({ _id: bookingId, user: req.user.id });
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const complaint = await Complaint.create({
        booking: booking._id,
        user: booking.user,
        caregiver: booking.caregiver,
        category,
        message
      });

      await notifyAdmins("New complaint raised", `Complaint for booking ${booking._id.toString().slice(-6)} is open.`);

      res.status(201).json({ message: "Complaint submitted", complaintId: complaint._id });
    } catch (error) {
      res.status(500).json({ message: "Failed to submit complaint" });
    }
  });

  app.get("/api/complaints/me", authRequired, async (req, res) => {
    try {
      let filter = {};
      if (req.user.role === "user") filter = { user: req.user.id };
      if (req.user.role === "caregiver") filter = { caregiver: req.user.id };

      const complaints = await Complaint.find(filter)
        .populate("booking", "patientName status")
        .populate("user", "name email")
        .populate("caregiver", "name")
        .sort({ createdAt: -1 });

      res.json(complaints);
    } catch (error) {
      res.status(500).json({ message: "Failed to load complaints" });
    }
  });

  app.patch("/api/admin/complaints/:id", authRequired, requireRole(["admin"]), async (req, res) => {
    try {
      const { status, resolutionNote = "" } = req.body;
      const allowedStatuses = ["open", "in-review", "resolved", "rejected"];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid complaint status" });
      }

      const complaint = await Complaint.findById(req.params.id);
      if (!complaint) {
        return res.status(404).json({ message: "Complaint not found" });
      }

      complaint.status = status;
      complaint.resolutionNote = resolutionNote;
      await complaint.save();

      await Promise.all([
        createNotification(complaint.user, "Complaint update", `Your complaint is now '${status}'.`),
        createNotification(complaint.caregiver, "Complaint update", `Complaint status is now '${status}'.`)
      ]);

      res.json({ message: "Complaint updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update complaint" });
    }
  });

  app.get("/api/notifications/me", authRequired, async (req, res) => {
    try {
      const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(30);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to load notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", authRequired, async (req, res) => {
    try {
      const notification = await Notification.findOne({ _id: req.params.id, user: req.user.id });
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      notification.read = true;
      await notification.save();
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update notification" });
    }
  });

  app.get("/api/admin/bookings", authRequired, requireRole(["admin"]), async (req, res) => {
    try {
      const bookings = await Booking.find()
        .populate("service", "name price")
        .populate("caregiver", "name")
        .populate("user", "name email")
        .sort({ createdAt: -1 });

      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Failed to load admin bookings" });
    }
  });

  app.get("/api/admin/users", authRequired, requireRole(["admin"]), async (req, res) => {
    try {
      const users = await User.find({}, "name email role verified qualifications serviceArea availability").sort({ createdAt: -1 });
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to load users" });
    }
  });

  app.patch("/api/admin/caregivers/:id/verify", authRequired, requireRole(["admin"]), async (req, res) => {
    try {
      const caregiver = await User.findOne({ _id: req.params.id, role: "caregiver" });

      if (!caregiver) {
        return res.status(404).json({ message: "Caregiver not found" });
      }

      caregiver.verified = true;
      await caregiver.save();

      await createNotification(caregiver._id, "Caregiver verified", "Your profile is now verified and active.");

      res.json({ message: "Caregiver verified successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to verify caregiver" });
    }
  });

  app.post("/api/admin/services", authRequired, requireRole(["admin"]), async (req, res) => {
    try {
      const { name, description, duration, price, requiredQualification } = req.body;
      if (!name || !description || !duration || !price || !requiredQualification) {
        return res.status(400).json({ message: "All service fields are required" });
      }

      const service = await Service.create({ name, description, duration, price, requiredQualification });
      res.status(201).json({ message: "Service added", service });
    } catch (error) {
      res.status(500).json({ message: "Failed to add service" });
    }
  });

  app.patch("/api/admin/services/:id", authRequired, requireRole(["admin"]), async (req, res) => {
    try {
      const service = await Service.findById(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }

      const { name, description, duration, price, requiredQualification } = req.body;
      if (name) service.name = name;
      if (description) service.description = description;
      if (duration) service.duration = duration;
      if (price) service.price = Number(price);
      if (requiredQualification) service.requiredQualification = requiredQualification;
      await service.save();

      res.json({ message: "Service updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  app.delete("/api/admin/services/:id", authRequired, requireRole(["admin"]), async (req, res) => {
    try {
      const service = await Service.findByIdAndDelete(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      res.json({ message: "Service deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete service" });
    }
  });

  app.get("/api/admin/analytics", authRequired, requireRole(["admin"]), async (req, res) => {
    try {
      const [
        registeredUsers,
        verifiedCaregivers,
        totalBookings,
        completedBookings,
        avgPendingMinutesRow,
        monthlyActiveUsers,
        avgUserRating
      ] = await Promise.all([
        User.countDocuments({ role: "user" }),
        User.countDocuments({ role: "caregiver", verified: true }),
        Booking.countDocuments(),
        Booking.countDocuments({ status: "completed" }),
        Booking.aggregate([
          { $match: { status: { $in: ["accepted", "in-progress", "completed", "rejected"] } } },
          {
            $project: {
              responseMinutes: {
                $divide: [{ $subtract: ["$updatedAt", "$createdAt"] }, 1000 * 60]
              }
            }
          },
          { $group: { _id: null, avgResponse: { $avg: "$responseMinutes" } } }
        ]),
        Booking.distinct("user", {
          createdAt: {
            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }),
        Booking.aggregate([
          { $match: { userRating: { $gte: 1 } } },
          { $group: { _id: null, value: { $avg: "$userRating" } } }
        ])
      ]);

      const completionRate = totalBookings ? Math.round((completedBookings / totalBookings) * 100) : 0;
      const averageResponseMinutes = avgPendingMinutesRow[0]?.avgResponse
        ? Number(avgPendingMinutesRow[0].avgResponse.toFixed(1))
        : 0;
      const satisfactionScore = avgUserRating[0]?.value ? Number(avgUserRating[0].value.toFixed(1)) : 0;

      res.json({
        registeredUsers,
        verifiedCaregivers,
        serviceBookingCompletionRate: completionRate,
        averageResponseMinutes,
        userSatisfactionScore: satisfactionScore,
        monthlyActiveUsers: monthlyActiveUsers.length
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to load analytics" });
    }
  });

  app.get("/api/admin/complaints", authRequired, requireRole(["admin"]), async (req, res) => {
    try {
      const complaints = await Complaint.find()
        .populate("booking", "patientName status")
        .populate("user", "name email")
        .populate("caregiver", "name")
        .sort({ createdAt: -1 });
      res.json(complaints);
    } catch (error) {
      res.status(500).json({ message: "Failed to load complaints" });
    }
  });

  return app;
}

async function connectAndStart() {
  try {
    await mongoose.connect(MONGO_URI);
    await ensureDefaultData();
    const app = createApp();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
  }
}

if (require.main === module) {
  connectAndStart();
}

module.exports = {
  createApp,
  ensureDefaultData,
  connectAndStart,
  calculateBookingAmount,
  buildInvoiceId
};
