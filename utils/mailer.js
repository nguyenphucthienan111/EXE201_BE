const nodemailer = require("nodemailer");
// Ensure .env is loaded even if this module is required before app.js (defensive)
try {
  require("dotenv").config();
} catch (e) {}

// Create transporter with SMTP configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // Use TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  family: 4, // Prefer IPv4
  tls: {
    rejectUnauthorized: false, // Allow self-signed certificates
  },
});

// Verify SMTP connection at startup
transporter.verify((err, success) => {
  if (err) {
    console.error("[SMTP] Connection failed:", err.message);
  } else {
    console.log(
      "[SMTP] Connected successfully. Emails will be sent via:",
      process.env.SMTP_HOST
    );
  }
});

// Function to send verification email
function sendVerificationEmail(to, code) {
  const html = `<p>Your verification code is <b>${code}</b></p>`;
  const fromAddr = process.env.SMTP_USER || "no-reply@example.com";

  return transporter
    .sendMail({
      from: fromAddr,
      to: to,
      subject: "Verify your account",
      html: html,
    })
    .then((info) => {
      console.log("[SMTP] Email sent successfully to:", to);
      return info;
    })
    .catch((err) => {
      console.error(
        "[SMTP] Failed to send email to:",
        to,
        "Error:",
        err.message
      );
      throw err;
    });
}

module.exports = { sendVerificationEmail };
