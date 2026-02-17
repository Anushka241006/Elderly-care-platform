const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const User = require("../models/User");
const Service = require("../models/Service");
const Booking = require("../models/Booking");
const { createApp, ensureDefaultData } = require("../server");

describe("Elderly Care API", () => {
  let mongo;
  let app;
  let userToken = "";
  let caregiverId = "";
  let serviceId = "";
  let bookingId = "";

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "elderlyCareTest" });
    await ensureDefaultData();
    app = createApp();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongo.stop();
  });

  it("registers a user", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "Test Family",
      email: "family@test.com",
      password: "Test@123",
      role: "user"
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.message).toMatch(/Registration successful/i);
  });

  it("logs in a user and returns JWT", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: "family@test.com",
      password: "Test@123"
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.token).toBeTruthy();
    userToken = response.body.token;
  });

  it("generates reset token and resets password", async () => {
    const requestReset = await request(app).post("/api/auth/request-reset").send({
      email: "family@test.com"
    });

    expect(requestReset.statusCode).toBe(200);
    expect(requestReset.body.resetToken).toBeTruthy();

    const resetPassword = await request(app).post("/api/auth/reset-password").send({
      token: requestReset.body.resetToken,
      newPassword: "NewPass@123"
    });

    expect(resetPassword.statusCode).toBe(200);

    const loginWithNewPassword = await request(app).post("/api/auth/login").send({
      email: "family@test.com",
      password: "NewPass@123"
    });

    expect(loginWithNewPassword.statusCode).toBe(200);
    expect(loginWithNewPassword.body.token).toBeTruthy();
    userToken = loginWithNewPassword.body.token;
  });

  it("creates caregiver + booking and completes payment/invoice flow", async () => {
    const caregiver = await User.create({
      name: "Verified Caregiver",
      email: "caregiver@test.com",
      password: "Care@123",
      role: "caregiver",
      verified: true,
      qualifications: "Nurse",
      serviceArea: "Delhi"
    });
    caregiverId = caregiver._id.toString();

    const service = await Service.findOne({ name: "Nursing Care" });
    serviceId = service._id.toString();

    const createBooking = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        patientName: "Patient One",
        patientAge: 72,
        medicalNeeds: "BP monitoring",
        serviceId,
        caregiverId,
        scheduleDate: "2026-03-01",
        planType: "daily"
      });

    expect(createBooking.statusCode).toBe(201);
    expect(createBooking.body.bookingId).toBeTruthy();
    expect(createBooking.body.amount).toBeGreaterThan(0);
    bookingId = createBooking.body.bookingId;

    const pay = await request(app)
      .post(`/api/bookings/${bookingId}/pay`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ paymentMethod: "upi" });

    expect(pay.statusCode).toBe(200);
    expect(pay.body.transactionId).toMatch(/^TXN-/);

    const invoice = await request(app)
      .get(`/api/bookings/${bookingId}/invoice`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(invoice.statusCode).toBe(200);
    expect(invoice.body.invoiceId).toMatch(/^INV-/);
    expect(invoice.body.amount).toBeGreaterThan(0);

    const dbBooking = await Booking.findById(bookingId);
    expect(dbBooking.paymentStatus).toBe("paid");
  });
});
