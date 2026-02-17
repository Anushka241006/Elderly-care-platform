const isLocalHost =
  window.location.hostname === "" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";
const API_BASE = isLocalHost
  ? "http://localhost:5000/api"
  : "https://elderly-care-backend.onrender.com/api";
let selectedBookingId = "";
let myBookingsCache = [];

function getToken() {
  return localStorage.getItem("token") || "";
}

function getRole() {
  return localStorage.getItem("role") || "";
}

function getName() {
  return localStorage.getItem("name") || "User";
}

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!headers["Content-Type"] && options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}

function ensureRole(expectedRoles) {
  const currentRole = getRole();
  if (!getToken() || !expectedRoles.includes(currentRole)) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

async function loadHomeServices() {
  const grid = document.getElementById("serviceGrid");
  if (!grid) return;
  try {
    const services = await api("/services");
    grid.innerHTML = services
      .map(
        (item) => `
          <article class="service-card">
            <h3>${item.name}</h3>
            <p>${item.description}</p>
            <p><strong>Duration:</strong> ${item.duration}</p>
            <p><strong>From:</strong> Rs ${item.price}</p>
            <p><strong>Qualification:</strong> ${item.requiredQualification}</p>
          </article>
        `
      )
      .join("");
  } catch (error) {
    grid.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  try {
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    localStorage.setItem("token", result.token);
    localStorage.setItem("role", result.role);
    localStorage.setItem("name", result.name);

    if (result.role === "user") window.location.href = "dashboard.html";
    else if (result.role === "caregiver") window.location.href = "caregiver.html";
    else window.location.href = "admin.html";
  } catch (error) {
    alert(error.message);
  }
}

function toggleCaregiverFields() {
  const role = document.getElementById("role")?.value;
  const fields = document.querySelectorAll(".caregiver-field");
  fields.forEach((field) => {
    field.style.display = role === "caregiver" ? "grid" : "none";
  });
}

async function handleRegister(event) {
  event.preventDefault();

  const role = document.getElementById("role").value;
  const payload = {
    name: document.getElementById("rname").value.trim(),
    email: document.getElementById("remail").value.trim(),
    password: document.getElementById("rpassword").value.trim(),
    role,
    qualifications: document.getElementById("qualification").value.trim(),
    serviceArea: document.getElementById("serviceArea").value.trim(),
    availability: document.getElementById("availability").value
  };

  try {
    const result = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    alert(result.message);
    window.location.href = "login.html";
  } catch (error) {
    alert(error.message);
  }
}

async function handleRequestReset(event) {
  event.preventDefault();
  const email = document.getElementById("resetEmail").value.trim();
  const tokenPreview = document.getElementById("resetTokenPreview");

  try {
    const result = await api("/auth/request-reset", {
      method: "POST",
      body: JSON.stringify({ email })
    });
    if (tokenPreview) {
      tokenPreview.textContent = result.resetToken
        ? `Reset token: ${result.resetToken} (valid for ${result.expiresInMinutes} min)`
        : result.message;
    }
    alert(result.message);
  } catch (error) {
    alert(error.message);
  }
}

async function handleConfirmReset(event) {
  event.preventDefault();
  const token = document.getElementById("resetToken").value.trim();
  const newPassword = document.getElementById("newPassword").value.trim();

  try {
    const result = await api("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword })
    });
    alert(result.message);
    window.location.href = "login.html";
  } catch (error) {
    alert(error.message);
  }
}

async function loadBookingFormOptions() {
  const [services, caregivers] = await Promise.all([api("/services"), api("/caregivers")]);

  const serviceSelect = document.getElementById("serviceSelect");
  const caregiverSelect = document.getElementById("caregiverSelect");
  const caregiverHint = document.getElementById("caregiverHint");
  const bookingForm = document.getElementById("bookingForm");

  serviceSelect.innerHTML =
    `<option value="" disabled selected>Select service</option>` +
    services
    .map((item) => `<option value="${item._id}">${item.name} (Rs ${item.price})</option>`)
    .join("");

  if (!caregivers.length) {
    caregiverSelect.innerHTML = `<option value="" disabled selected>No verified caregiver available</option>`;
    caregiverSelect.disabled = true;
    if (bookingForm) {
      const submitBtn = bookingForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
    }
    if (caregiverHint) {
      caregiverHint.textContent =
        "No verified caregivers are available right now. Ask admin to verify caregiver profiles.";
    }
    return;
  }

  caregiverSelect.disabled = false;
  caregiverSelect.innerHTML =
    `<option value="" disabled selected>Select caregiver</option>` +
    caregivers
      .map(
        (item) =>
          `<option value="${item._id}">${item.name} | ${item.qualifications || "General Care"} | ${item.serviceArea || "N/A"}</option>`
      )
      .join("");

  if (bookingForm) {
    const submitBtn = bookingForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = false;
  }
  if (caregiverHint) caregiverHint.textContent = "";

  const caregiverDirectory = document.getElementById("caregiverDirectory");
  if (caregiverDirectory) {
    caregiverDirectory.innerHTML = caregivers.length
      ? caregivers
          .map(
            (item) => `
            <article class="booking-card">
              <h3>${item.name}</h3>
              <p><strong>Qualification:</strong> ${item.qualifications || "General Care"}</p>
              <p><strong>Area:</strong> ${item.serviceArea || "N/A"}</p>
              <p><strong>Availability:</strong> ${item.availability || "N/A"}</p>
              <p><strong>Rating:</strong> ${item.averageRating || 0}/5 (${item.reviewCount || 0} reviews)</p>
            </article>
          `
          )
          .join("")
      : "<p class='muted'>No caregivers available.</p>";
  }
}

function bookingCard(booking, showCaregiverActions = false) {
  const statusClass = booking.status || "pending";
  const paymentClass = booking.paymentStatus || "unpaid";
  const isUser = getRole() === "user";
  const canReview = isUser && booking.status === "completed";
  const canPay = booking.paymentStatus !== "paid";
  const paymentButtons =
    !showCaregiverActions && isUser
      ? `
      <p><strong>Payment:</strong> <span class="badge ${paymentClass}">${booking.paymentStatus || "unpaid"}</span></p>
      <p><strong>Amount:</strong> Rs ${booking.bookingAmount || booking.service?.price || 0}</p>
      <div class="actions">
        <button class="btn btn-primary" onclick="payForBooking('${booking._id}')" ${canPay ? "" : "disabled"}>${canPay ? "Pay Now" : "Paid"}</button>
        <button class="btn btn-ghost" onclick="downloadInvoice('${booking._id}')">Download Invoice</button>
      </div>
      ${
        canReview
          ? `
      <div class="actions">
        <input id="rating-${booking._id}" type="number" min="1" max="5" placeholder="Rating 1-5" />
        <input id="review-${booking._id}" type="text" placeholder="Write review" />
        <button class="btn btn-ghost" onclick="submitReview('${booking._id}')">Submit Review</button>
      </div>
      `
          : ""
      }
    `
      : "";
  return `
    <article class="booking-card">
      <h3>${booking.patientName} (${booking.patientAge})</h3>
      <p><strong>Service:</strong> ${booking.service?.name || "-"}</p>
      <p><strong>Date:</strong> ${formatDate(booking.scheduleDate)}</p>
      <p><strong>Plan:</strong> ${booking.planType}</p>
      <p><strong>Caregiver:</strong> ${booking.caregiver?.name || "-"}</p>
      <p><strong>Medical Needs:</strong> ${booking.medicalNeeds || "None"}</p>
      <p><strong>Status:</strong> <span class="badge ${statusClass}">${booking.status}</span></p>
      <p><strong>Care Notes:</strong> ${booking.careNotes || "Not added yet"}</p>
      ${booking.userRating ? `<p><strong>Your Rating:</strong> ${booking.userRating}/5</p>` : ""}
      ${paymentButtons}
      ${
        showCaregiverActions
          ? `
          <label>Update Care Notes
            <textarea id="note-${booking._id}" rows="2" placeholder="Add notes"></textarea>
          </label>
          <div class="actions">
            <button class="btn btn-ghost" onclick="updateBookingStatus('${booking._id}', 'accepted')">Accept</button>
            <button class="btn btn-ghost" onclick="updateBookingStatus('${booking._id}', 'in-progress')">Start</button>
            <button class="btn btn-primary" onclick="updateBookingStatus('${booking._id}', 'completed')">Complete</button>
            <button class="btn btn-ghost" onclick="updateBookingStatus('${booking._id}', 'rejected')">Reject</button>
          </div>
        `
          : ""
      }
    </article>
  `;
}

async function payForBooking(bookingId) {
  selectedBookingId = bookingId;
  const modal = document.getElementById("paymentModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closePaymentModal() {
  selectedBookingId = "";
  const modal = document.getElementById("paymentModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

async function confirmPaymentFromModal() {
  if (!selectedBookingId) return;
  const methodInput = document.getElementById("paymentMethodSelect");
  const method = methodInput ? methodInput.value : "upi";
  try {
    const result = await api(`/bookings/${selectedBookingId}/pay`, {
      method: "POST",
      body: JSON.stringify({ paymentMethod: method.toLowerCase().trim() })
    });
    alert(`${result.message}\nTransaction: ${result.transactionId}`);
    closePaymentModal();
    await loadMyBookings();
  } catch (error) {
    alert(error.message);
  }
}

function bindPaymentModal() {
  const modal = document.getElementById("paymentModal");
  const cancelBtn = document.getElementById("paymentCancelBtn");
  const confirmBtn = document.getElementById("paymentConfirmBtn");
  if (!modal || !cancelBtn || !confirmBtn) return;

  cancelBtn.addEventListener("click", closePaymentModal);
  confirmBtn.addEventListener("click", confirmPaymentFromModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closePaymentModal();
    }
  });
}

function openInvoiceWindow(invoice) {
  const html = `
    <html>
      <head>
        <title>${invoice.invoiceId}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a1a; }
          h1 { margin-bottom: 6px; }
          .muted { color: #555; margin-bottom: 18px; }
          .box { border: 1px solid #ccc; border-radius: 8px; padding: 14px; margin-bottom: 14px; }
          .row { margin: 6px 0; }
        </style>
      </head>
      <body>
        <h1>Care24 Invoice</h1>
        <p class="muted">${invoice.invoiceId}</p>
        <div class="box">
          <div class="row"><strong>Customer:</strong> ${invoice.customerName}</div>
          <div class="row"><strong>Email:</strong> ${invoice.customerEmail}</div>
          <div class="row"><strong>Patient:</strong> ${invoice.patientName} (${invoice.patientAge})</div>
          <div class="row"><strong>Service:</strong> ${invoice.serviceName}</div>
          <div class="row"><strong>Caregiver:</strong> ${invoice.caregiverName}</div>
        </div>
        <div class="box">
          <div class="row"><strong>Plan:</strong> ${invoice.planType}</div>
          <div class="row"><strong>Schedule:</strong> ${formatDate(invoice.scheduleDate)}</div>
          <div class="row"><strong>Payment Method:</strong> ${invoice.paymentMethod}</div>
          <div class="row"><strong>Transaction ID:</strong> ${invoice.transactionId}</div>
          <div class="row"><strong>Issued On:</strong> ${formatDate(invoice.issuedAt)}</div>
          <div class="row"><strong>Total Amount:</strong> Rs ${invoice.amount}</div>
        </div>
        <script>window.print();<\/script>
      </body>
    </html>
  `;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
}

async function downloadInvoice(bookingId) {
  try {
    const invoice = await api(`/bookings/${bookingId}/invoice`);
    openInvoiceWindow(invoice);
  } catch (error) {
    alert(error.message);
  }
}

async function submitReview(bookingId) {
  const rating = Number(document.getElementById(`rating-${bookingId}`)?.value || 0);
  const review = document.getElementById(`review-${bookingId}`)?.value.trim() || "";
  try {
    await api(`/bookings/${bookingId}/review`, {
      method: "POST",
      body: JSON.stringify({ rating, review })
    });
    alert("Review submitted");
    await loadMyBookings();
    await loadBookingFormOptions();
  } catch (error) {
    alert(error.message);
  }
}

async function loadPatients() {
  const list = document.getElementById("patientList");
  if (!list) return;
  try {
    const patients = await api("/patients/me");
    list.innerHTML = patients.length
      ? patients
          .map(
            (item) => `
        <article class="booking-card">
          <h3>${item.name} (${item.age})</h3>
          <p><strong>Medical Needs:</strong> ${item.medicalNeeds || "None"}</p>
        </article>
      `
          )
          .join("")
      : "<p class='muted'>No patient profile added yet.</p>";
  } catch (error) {
    list.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function handlePatientProfileSave(event) {
  event.preventDefault();
  try {
    await api("/patients", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("profilePatientName").value.trim(),
        age: Number(document.getElementById("profilePatientAge").value),
        medicalNeeds: document.getElementById("profileMedicalNeeds").value.trim()
      })
    });
    alert("Patient profile saved");
    event.target.reset();
    await loadPatients();
  } catch (error) {
    alert(error.message);
  }
}

async function loadMyComplaints() {
  const container = document.getElementById("myComplaints");
  if (!container) return;
  try {
    const complaints = await api("/complaints/me");
    container.innerHTML = complaints.length
      ? complaints
          .map(
            (item) => `
        <article class="booking-card">
          <h3>${item.category.toUpperCase()}</h3>
          <p><strong>Status:</strong> <span class="badge ${item.status}">${item.status}</span></p>
          <p><strong>Message:</strong> ${item.message}</p>
          <p><strong>Resolution:</strong> ${item.resolutionNote || "Pending"}</p>
        </article>
      `
          )
          .join("")
      : "<p class='muted'>No complaints raised.</p>";
  } catch (error) {
    container.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function handleComplaintSubmit(event) {
  event.preventDefault();
  try {
    await api("/complaints", {
      method: "POST",
      body: JSON.stringify({
        bookingId: document.getElementById("complaintBookingId").value,
        category: document.getElementById("complaintCategory").value,
        message: document.getElementById("complaintMessage").value.trim()
      })
    });
    alert("Complaint submitted");
    event.target.reset();
    await loadMyComplaints();
  } catch (error) {
    alert(error.message);
  }
}

async function loadEarnings() {
  const container = document.getElementById("earningSummary");
  if (!container) return;
  try {
    const data = await api("/caregiver/earnings");
    container.innerHTML = `
      <article class="booking-card"><h3>Completed Services</h3><p>${data.completedServices}</p></article>
      <article class="booking-card"><h3>Gross Earnings</h3><p>Rs ${data.grossEarnings}</p></article>
      <article class="booking-card"><h3>Platform Fee</h3><p>Rs ${data.platformFee}</p></article>
      <article class="booking-card"><h3>Net Earnings</h3><p>Rs ${data.netEarnings}</p></article>
    `;
  } catch (error) {
    container.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function handleCaregiverProfileUpdate(event) {
  event.preventDefault();
  try {
    await api("/caregiver/profile", {
      method: "PATCH",
      body: JSON.stringify({
        qualifications: document.getElementById("cgQualification").value.trim(),
        serviceArea: document.getElementById("cgServiceArea").value.trim(),
        availability: document.getElementById("cgAvailability").value
      })
    });
    alert("Profile updated");
  } catch (error) {
    alert(error.message);
  }
}

async function loadCaregiverComplaints() {
  const container = document.getElementById("caregiverComplaints");
  if (!container) return;
  try {
    const complaints = await api("/complaints/me");
    container.innerHTML = complaints.length
      ? complaints
          .map(
            (item) => `
        <article class="booking-card">
          <h3>${item.category.toUpperCase()}</h3>
          <p><strong>Status:</strong> <span class="badge ${item.status}">${item.status}</span></p>
          <p><strong>Message:</strong> ${item.message}</p>
          <p><strong>Resolution:</strong> ${item.resolutionNote || "Pending"}</p>
        </article>
      `
          )
          .join("")
      : "<p class='muted'>No complaints assigned.</p>";
  } catch (error) {
    container.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function loadAdminAnalytics() {
  const container = document.getElementById("analyticsCards");
  if (!container) return;
  try {
    const data = await api("/admin/analytics");
    container.innerHTML = `
      <article class="service-card"><h3>Registered Users</h3><p>${data.registeredUsers}</p></article>
      <article class="service-card"><h3>Verified Caregivers</h3><p>${data.verifiedCaregivers}</p></article>
      <article class="service-card"><h3>Completion Rate</h3><p>${data.serviceBookingCompletionRate}%</p></article>
      <article class="service-card"><h3>Avg Response Time</h3><p>${data.averageResponseMinutes} min</p></article>
      <article class="service-card"><h3>Satisfaction Score</h3><p>${data.userSatisfactionScore}/5</p></article>
      <article class="service-card"><h3>Monthly Active Users</h3><p>${data.monthlyActiveUsers}</p></article>
    `;
  } catch (error) {
    container.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function loadAdminServices() {
  const container = document.getElementById("adminServiceList");
  if (!container) return;
  try {
    const services = await api("/services");
    container.innerHTML = services
      .map(
        (item) => `
      <article class="booking-card">
        <h3>${item.name}</h3>
        <p>${item.description}</p>
        <p><strong>Duration:</strong> ${item.duration}</p>
        <p><strong>Price:</strong> Rs ${item.price}</p>
        <p><strong>Qualification:</strong> ${item.requiredQualification}</p>
        <button class="btn btn-ghost" onclick="deleteService('${item._id}')">Delete</button>
      </article>
    `
      )
      .join("");
  } catch (error) {
    container.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function handleAddService(event) {
  event.preventDefault();
  try {
    await api("/admin/services", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("serviceFormName").value.trim(),
        description: document.getElementById("serviceFormDescription").value.trim(),
        duration: document.getElementById("serviceFormDuration").value.trim(),
        price: Number(document.getElementById("serviceFormPrice").value),
        requiredQualification: document.getElementById("serviceFormQualification").value.trim()
      })
    });
    alert("Service added");
    event.target.reset();
    await loadAdminServices();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteService(serviceId) {
  try {
    await api(`/admin/services/${serviceId}`, { method: "DELETE" });
    alert("Service deleted");
    await loadAdminServices();
  } catch (error) {
    alert(error.message);
  }
}

async function loadAdminComplaints() {
  const container = document.getElementById("adminComplaints");
  if (!container) return;
  try {
    const complaints = await api("/admin/complaints");
    container.innerHTML = complaints.length
      ? complaints
          .map(
            (item) => `
        <article class="booking-card">
          <h3>${item.category.toUpperCase()}</h3>
          <p><strong>User:</strong> ${item.user?.name || "-"}</p>
          <p><strong>Caregiver:</strong> ${item.caregiver?.name || "-"}</p>
          <p><strong>Status:</strong> <span class="badge ${item.status}">${item.status}</span></p>
          <p><strong>Message:</strong> ${item.message}</p>
          <input id="resolution-${item._id}" type="text" placeholder="Resolution note" />
          <div class="actions">
            <button class="btn btn-ghost" onclick="updateComplaintStatus('${item._id}', 'in-review')">In Review</button>
            <button class="btn btn-primary" onclick="updateComplaintStatus('${item._id}', 'resolved')">Resolve</button>
            <button class="btn btn-ghost" onclick="updateComplaintStatus('${item._id}', 'rejected')">Reject</button>
          </div>
        </article>
      `
          )
          .join("")
      : "<p class='muted'>No complaints in system.</p>";
  } catch (error) {
    container.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function updateComplaintStatus(complaintId, status) {
  const resolutionNote = document.getElementById(`resolution-${complaintId}`)?.value.trim() || "";
  try {
    await api(`/admin/complaints/${complaintId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, resolutionNote })
    });
    alert("Complaint updated");
    await loadAdminComplaints();
  } catch (error) {
    alert(error.message);
  }
}

async function loadNotifications() {
  const container = document.getElementById("notificationList");
  if (!container) return;
  try {
    const notifications = await api("/notifications/me");
    container.innerHTML = notifications.length
      ? notifications
          .map(
            (item) => `
        <article class="booking-card">
          <h3>${item.title}</h3>
          <p>${item.message}</p>
          <p class="muted">${formatDate(item.createdAt)}</p>
          <button class="btn btn-ghost" onclick="markNotificationRead('${item._id}')" ${item.read ? "disabled" : ""}>
            ${item.read ? "Read" : "Mark as Read"}
          </button>
        </article>
      `
          )
          .join("")
      : "<p class='muted'>No notifications.</p>";
  } catch (error) {
    container.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function markNotificationRead(notificationId) {
  try {
    await api(`/notifications/${notificationId}/read`, { method: "PATCH" });
    await loadNotifications();
  } catch (error) {
    alert(error.message);
  }
}

function startNotificationPolling() {
  if (!document.getElementById("notificationList")) return;
  setInterval(() => {
    loadNotifications().catch(() => {});
  }, 20000);
}

async function loadMyBookings() {
  const container = document.getElementById("myBookings");
  if (!container) return;
  try {
    const bookings = await api("/bookings/me");
    myBookingsCache = bookings;
    container.innerHTML = bookings.length
      ? bookings.map((item) => bookingCard(item)).join("")
      : "<p class='muted'>No bookings yet.</p>";

    const complaintBookingSelect = document.getElementById("complaintBookingId");
    const complaintForm = document.getElementById("complaintForm");
    const complaintSubmitBtn = complaintForm?.querySelector('button[type="submit"]');
    if (complaintBookingSelect) {
      if (!bookings.length) {
        complaintBookingSelect.innerHTML =
          `<option value="" disabled selected>No bookings available</option>`;
        complaintBookingSelect.disabled = true;
        if (complaintSubmitBtn) complaintSubmitBtn.disabled = true;
      } else {
        complaintBookingSelect.disabled = false;
        complaintBookingSelect.innerHTML =
          `<option value="" disabled selected>Select booking</option>` +
          bookings
            .map(
              (item) =>
                `<option value="${item._id}">${item.patientName} - ${item.service?.name || "Service"} (${formatDate(item.scheduleDate)})</option>`
            )
            .join("");
        if (complaintSubmitBtn) complaintSubmitBtn.disabled = false;
      }
    }
  } catch (error) {
    container.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function handleBooking(event) {
  event.preventDefault();
  const payload = {
    patientName: document.getElementById("patientName").value.trim(),
    patientAge: Number(document.getElementById("patientAge").value),
    medicalNeeds: document.getElementById("medicalNeeds").value.trim(),
    serviceId: document.getElementById("serviceSelect").value,
    caregiverId: document.getElementById("caregiverSelect").value,
    scheduleDate: document.getElementById("scheduleDate").value,
    planType: document.getElementById("planType").value
  };

  try {
    const result = await api("/bookings", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    alert(result.message);
    event.target.reset();
    await loadMyBookings();
  } catch (error) {
    alert(error.message);
  }
}

async function loadCaregiverBookings() {
  const container = document.getElementById("caregiverBookings");
  if (!container) return;
  try {
    const bookings = await api("/bookings/caregiver");
    container.innerHTML = bookings.length
      ? bookings.map((item) => bookingCard(item, true)).join("")
      : "<p class='muted'>No assigned bookings.</p>";
  } catch (error) {
    container.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function updateBookingStatus(bookingId, status) {
  try {
    const noteBox = document.getElementById(`note-${bookingId}`);
    const careNotes = noteBox ? noteBox.value.trim() : "";

    await api(`/bookings/${bookingId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, careNotes })
    });
    alert("Booking updated");
    if (getRole() === "caregiver") {
      await loadCaregiverBookings();
      await loadEarnings();
    }
    if (getRole() === "admin") await loadAllBookings();
  } catch (error) {
    alert(error.message);
  }
}

async function loadAllBookings() {
  const container = document.getElementById("allBookings");
  if (!container) return;
  try {
    const bookings = await api("/admin/bookings");
    container.innerHTML = bookings.length
      ? bookings
          .map(
            (item) => `
        <article class="booking-card">
          <h3>${item.patientName} (${item.patientAge})</h3>
          <p><strong>User:</strong> ${item.user?.name || "-"}</p>
          <p><strong>Caregiver:</strong> ${item.caregiver?.name || "-"}</p>
          <p><strong>Service:</strong> ${item.service?.name || "-"}</p>
          <p><strong>Status:</strong> <span class="badge ${item.status}">${item.status}</span></p>
          <p><strong>Notes:</strong> ${item.careNotes || "None"}</p>
        </article>
      `
          )
          .join("")
      : "<p class='muted'>No bookings in system.</p>";
  } catch (error) {
    container.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function loadPendingCaregivers() {
  const container = document.getElementById("caregiverApprovalList");
  if (!container) return;
  try {
    const users = await api("/admin/users");
    const pending = users.filter((item) => item.role === "caregiver" && !item.verified);
    container.innerHTML = pending.length
      ? pending
          .map(
            (item) => `
        <article class="approval-card">
          <h3>${item.name}</h3>
          <p><strong>Email:</strong> ${item.email}</p>
          <p><strong>Qualification:</strong> ${item.qualifications || "N/A"}</p>
          <p><strong>Area:</strong> ${item.serviceArea || "N/A"}</p>
          <button class="btn btn-primary" onclick="verifyCaregiver('${item._id}')">Verify</button>
        </article>
      `
          )
          .join("")
      : "<p class='muted'>No pending caregiver approvals.</p>";
  } catch (error) {
    container.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function verifyCaregiver(userId) {
  try {
    await api(`/admin/caregivers/${userId}/verify`, { method: "PATCH" });
    alert("Caregiver verified");
    await loadPendingCaregivers();
  } catch (error) {
    alert(error.message);
  }
}

function bindSharedHeader() {
  const welcome = document.getElementById("welcomeText");
  if (welcome) {
    welcome.textContent = `Hello, ${getName()}`;
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
}

function setMinDate() {
  const input = document.getElementById("scheduleDate");
  if (!input) return;
  const today = new Date().toISOString().split("T")[0];
  input.min = today;
}

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;

  if (page === "home") {
    await loadHomeServices();
    return;
  }

  if (page === "login") {
    document.getElementById("loginForm").addEventListener("submit", handleLogin);
    return;
  }

  if (page === "register") {
    const roleInput = document.getElementById("role");
    roleInput.addEventListener("change", toggleCaregiverFields);
    toggleCaregiverFields();
    document.getElementById("registerForm").addEventListener("submit", handleRegister);
    return;
  }

  if (page === "forgot-password") {
    document.getElementById("requestResetForm").addEventListener("submit", handleRequestReset);
    document.getElementById("confirmResetForm").addEventListener("submit", handleConfirmReset);
    return;
  }

  bindSharedHeader();

  if (page === "dashboard") {
    if (!ensureRole(["user"])) return;
    setMinDate();
    bindPaymentModal();
    document.getElementById("patientForm")?.addEventListener("submit", handlePatientProfileSave);
    document.getElementById("bookingForm").addEventListener("submit", handleBooking);
    document.getElementById("complaintForm")?.addEventListener("submit", handleComplaintSubmit);
    await Promise.all([
      loadPatients(),
      loadBookingFormOptions(),
      loadMyBookings(),
      loadMyComplaints(),
      loadNotifications()
    ]);
    startNotificationPolling();
    return;
  }

  if (page === "caregiver") {
    if (!ensureRole(["caregiver"])) return;
    document.getElementById("caregiverProfileForm")?.addEventListener("submit", handleCaregiverProfileUpdate);
    await Promise.all([
      loadCaregiverBookings(),
      loadEarnings(),
      loadCaregiverComplaints(),
      loadNotifications()
    ]);
    startNotificationPolling();
    return;
  }

  if (page === "admin") {
    if (!ensureRole(["admin"])) return;
    document.getElementById("serviceForm")?.addEventListener("submit", handleAddService);
    await Promise.all([
      loadAdminAnalytics(),
      loadAdminServices(),
      loadPendingCaregivers(),
      loadAdminComplaints(),
      loadAllBookings(),
      loadNotifications()
    ]);
    startNotificationPolling();
  }
});
