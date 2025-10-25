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
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #6f5aa7 0%, #8e7ec1 100%); padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
            🎉 Welcome to Everquill!
          </h1>
          <p style="color: #f0f0f0; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
            Your journey to better mental health starts here
          </p>
        </div>

        <!-- Main Content -->
        <div style="padding: 40px 30px; text-align: center;">
          <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 16px; padding: 30px; margin: 20px 0; border: 2px solid #e9ecef;">
            <h2 style="color: #6f5aa7; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">
              📧 Verify Your Email Address
            </h2>
            
            <p style="color: #495057; font-size: 18px; line-height: 1.6; margin: 0 0 25px 0;">
              To complete your registration, please enter the verification code below:
            </p>

            <!-- Verification Code Box -->
            <div style="background: #ffffff; border: 3px solid #6f5aa7; border-radius: 12px; padding: 25px; margin: 25px 0; box-shadow: 0 4px 15px rgba(111, 90, 167, 0.2);">
              <p style="color: #6f5aa7; font-size: 16px; margin: 0 0 15px 0; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Your Verification Code:
              </p>
              <div style="background: linear-gradient(135deg, #6f5aa7 0%, #8e7ec1 100%); color: #ffffff; font-size: 32px; font-weight: 700; padding: 20px; border-radius: 8px; letter-spacing: 3px; text-shadow: 0 2px 4px rgba(0,0,0,0.3); font-family: 'Courier New', monospace;">
                ${code}
              </div>
            </div>

            <p style="color: #6c757d; font-size: 16px; line-height: 1.5; margin: 20px 0 0 0;">
              ⏰ This code will expire in <strong style="color: #dc3545;">10 minutes</strong>
            </p>
          </div>

          <!-- Instructions -->
          <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 20px; margin: 20px 0; border-radius: 8px;">
            <h3 style="color: #1976d2; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">
              🔐 How to verify:
            </h3>
            <ol style="color: #1976d2; font-size: 16px; line-height: 1.6; margin: 0; padding-left: 20px;">
              <li>Return to the Everquill website</li>
              <li>Enter the verification code above</li>
              <li>Start your mental health journey!</li>
            </ol>
          </div>

          <!-- Security Notice -->
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="color: #856404; margin: 0; font-size: 14px; line-height: 1.5;">
              🔒 <strong>Security Notice:</strong> Never share this code with anyone. Everquill will never ask for your verification code via phone or email.
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f8f9fa; padding: 25px 30px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; margin: 0 0 10px 0; font-size: 14px;">
            If you didn't create an account, please ignore this email.
          </p>
          <p style="color: #6c757d; margin: 0; font-size: 12px;">
            © 2024 Everquill. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
🎉 Welcome to Everquill!

Your journey to better mental health starts here.

📧 VERIFY YOUR EMAIL ADDRESS

To complete your registration, please enter the verification code below:

Your Verification Code: ${code}

⏰ This code will expire in 10 minutes.

🔐 How to verify:
1. Return to the Everquill website
2. Enter the verification code above  
3. Start your mental health journey!

🔒 Security Notice: Never share this code with anyone. Everquill will never ask for your verification code via phone or email.

If you didn't create an account, please ignore this email.

© 2024 Everquill. All rights reserved.
  `;

  const fromAddr = process.env.SMTP_USER || "noreply@everquill.com";

  return transporter
    .sendMail({
      from: `"Everquill Team" <${fromAddr}>`,
      to: to,
      subject: "🎉 Welcome to Everquill - Verify Your Email",
      html: html,
      text: text,
      // Email authentication headers to avoid spam
      headers: {
        "X-Mailer": "Everquill",
        "X-Priority": "3",
        "X-MSMail-Priority": "Normal",
        Importance: "Normal",
        "X-Report-Abuse": "Please report abuse to abuse@everquill.com",
        "List-Unsubscribe": "<mailto:unsubscribe@everquill.com>",
        "Return-Path": fromAddr,
        "Reply-To": "support@everquill.com",
      },
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

// Function to send contact notification email to admin
function sendContactNotification(contactData) {
  const { name, email, message, contactId } = contactData;
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;

  if (!adminEmail) {
    throw new Error("Admin email not configured");
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Contact Message</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
      <div style="max-width: 700px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%); padding: 25px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
            📧 New Contact Message
          </h1>
          <p style="color: #f0f0f0; margin: 8px 0 0 0; font-size: 16px; opacity: 0.9;">
            Someone has contacted you through Everquill
          </p>
        </div>

        <!-- Main Content -->
        <div style="padding: 30px 25px;">
          
          <!-- Contact Details Card -->
          <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 16px; padding: 25px; margin: 20px 0; border: 2px solid #e9ecef; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <h2 style="color: #6f5aa7; margin: 0 0 20px 0; font-size: 22px; font-weight: 600; text-align: center;">
              👤 Contact Information
            </h2>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
              <div style="background: #ffffff; padding: 15px; border-radius: 8px; border-left: 4px solid #6f5aa7;">
                <p style="color: #6f5aa7; margin: 0 0 5px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                  Name
                </p>
                <p style="color: #333; margin: 0; font-size: 18px; font-weight: 600;">
                  ${name}
                </p>
              </div>
              
              <div style="background: #ffffff; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745;">
                <p style="color: #28a745; margin: 0 0 5px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                  Email
                </p>
                <p style="color: #333; margin: 0; font-size: 18px; font-weight: 600;">
                  ${email}
                </p>
              </div>
            </div>

            <!-- Message Box -->
            <div style="background: #ffffff; border: 3px solid #6f5aa7; border-radius: 12px; padding: 25px; margin: 20px 0; box-shadow: 0 4px 15px rgba(111, 90, 167, 0.1);">
              <h3 style="color: #6f5aa7; margin: 0 0 15px 0; font-size: 18px; font-weight: 600; text-align: center;">
                💬 Message
              </h3>
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #6f5aa7; font-size: 16px; line-height: 1.6; color: #333;">
                ${message.replace(/\n/g, "<br>")}
              </div>
            </div>
          </div>

          <!-- Reply Instructions -->
          <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #155724; margin: 0 0 10px 0; font-size: 18px; font-weight: 600;">
              💌 How to Reply
            </h3>
            <p style="color: #155724; margin: 0; font-size: 16px; line-height: 1.5;">
              You can reply directly to this email to respond to the user. The reply will be sent to <strong>${email}</strong>
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f8f9fa; padding: 20px 25px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; margin: 0; font-size: 14px;">
            This message was sent from your Everquill contact form.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
New Contact Message

Name: ${name}
Email: ${email}
Message: ${message}

Contact ID: ${contactId}
Received: ${new Date().toLocaleString()}

You can reply directly to this email to respond to the user.
  `;

  return transporter
    .sendMail({
      from: process.env.SMTP_USER,
      to: adminEmail,
      replyTo: email, // Allow admin to reply directly to user
      subject: `New Contact Message from ${name}`,
      html: html,
      text: text,
    })
    .then((info) => {
      console.log(
        "[SMTP] Contact notification sent successfully to:",
        adminEmail
      );
      return info;
    })
    .catch((err) => {
      console.error("[SMTP] Failed to send contact notification:", err.message);
      throw err;
    });
}

module.exports = { sendVerificationEmail, sendContactNotification };
