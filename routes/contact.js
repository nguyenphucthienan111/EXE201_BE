const express = require("express");
const { body, validationResult } = require("express-validator");
const Contact = require("../models/Contact");
const { sendContactNotification } = require("../utils/mailer");

const router = express.Router();

/**
 * @swagger
 * /api/contact:
 *   post:
 *     summary: Send contact message
 *     tags: [Contact]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - message
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 255
 *                 example: "john@example.com"
 *               message:
 *                 type: string
 *                 maxLength: 1000
 *                 example: "I have a question about your service"
 *     responses:
 *       200:
 *         description: Contact message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Thank you for your message. We will get back to you soon."
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Validation failed"
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: Internal server error
 */
router.post(
  "/",
  [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Name is required")
      .isLength({ max: 100 })
      .withMessage("Name must be less than 100 characters"),
    body("email")
      .trim()
      .isEmail()
      .withMessage("Please provide a valid email address")
      .isLength({ max: 255 })
      .withMessage("Email must be less than 255 characters"),
    body("message")
      .trim()
      .notEmpty()
      .withMessage("Message is required")
      .isLength({ max: 1000 })
      .withMessage("Message must be less than 1000 characters"),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array().map((err) => err.msg),
        });
      }

      const { name, email, message } = req.body;

      // Create contact record
      const contact = new Contact({
        name,
        email,
        message,
      });

      await contact.save();

      // Send email notification to admin
      try {
        await sendContactNotification({
          name,
          email,
          message,
          contactId: contact._id,
        });
        console.log("[CONTACT] Email notification sent successfully");
      } catch (emailError) {
        console.error(
          "[CONTACT] Failed to send email notification:",
          emailError.message
        );
        // Don't fail the request if email fails
      }

      res.status(200).json({
        success: true,
        message: "Thank you for your message. We will get back to you soon.",
        data: {
          contactId: contact._id,
        },
      });
    } catch (error) {
      console.error("[CONTACT] Error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send message. Please try again later.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

module.exports = router;
