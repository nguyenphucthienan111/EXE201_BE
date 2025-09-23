var nodemailer = require("nodemailer");

var transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

function sendVerificationEmail(to, code) {
  var html = "<p>Your verification code is <b>" + code + "</b></p>";
  return transporter.sendMail({
    from: process.env.SMTP_USER,
    to: to,
    subject: "Verify your Everquill account",
    html: html,
  });
}

module.exports = { sendVerificationEmail: sendVerificationEmail };
