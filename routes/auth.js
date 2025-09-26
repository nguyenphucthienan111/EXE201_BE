var express = require("express");
var router = express.Router();
var bcrypt = require("bcryptjs");
var jwt = require("jsonwebtoken");
var { body, validationResult } = require("express-validator");
var passport = require("passport");
var { v4: uuidv4 } = require("uuid");
var User = require("../models/User");
var mailer = require("../utils/mailer");
var { requireAuth } = require("../middlewares/auth");

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register with email + password (Gmail allowed)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Registered and verification email sent
 */
router.post(
  "/register",
  [body("email").isEmail(), body("password").isLength({ min: 6 })],
  function (req, res) {
    var errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    var email = req.body.email.toLowerCase();
    var password = req.body.password;
    User.findOne({ email: email })
      .then(function (existing) {
        if (existing)
          return res.status(409).json({ message: "Email already used" });
        return bcrypt.hash(password, 10).then(function (hash) {
          var code = uuidv4().slice(0, 6).toUpperCase();
          var user = new User({
            email: email,
            passwordHash: hash,
            emailVerificationCode: code,
            plan: "free",
          });
          return user.save().then(function (saved) {
            console.log(
              "[DEBUG] User saved successfully, attempting to send email to:",
              email
            );
            return mailer.sendVerificationEmail(email, code).then(function () {
              var payload = {
                message: "Registered. Check email for verification code.",
              };
              if (process.env.NODE_ENV !== "production") {
                payload.devVerificationCode = code;
              }
              console.log("[DEBUG] Email sent successfully to:", email);
              res.json(payload);
            });
          });
        });
      })
      .catch(function (err) {
        console.error(
          "[ERROR] Failed to send email to:",
          email,
          "Error:",
          err.message
        );
        res.status(500).json({ message: err.message });
      });
  }
);

/** Verify email code */
/**
 * @openapi
 * /api/auth/verify:
 *   post:
 *     summary: Verify email with code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string }
 *               code: { type: string }
 *     responses:
 *       200: { description: Verified }
 */
router.post(
  "/verify",
  [body("email").isEmail(), body("code").isLength({ min: 6 })],
  function (req, res) {
    var errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });
    User.findOne({ email: req.body.email.toLowerCase() })
      .then(function (user) {
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.isEmailVerified)
          return res.json({ message: "Already verified" });
        if (user.emailVerificationCode !== req.body.code)
          return res.status(400).json({ message: "Invalid code" });
        user.isEmailVerified = true;
        user.emailVerificationCode = undefined;
        return user.save().then(function () {
          res.json({ message: "Email verified" });
        });
      })
      .catch(function (err) {
        res.status(500).json({ message: err.message });
      });
  }
);

/** Login */
/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Login with email/password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: JWT issued }
 */
router.post(
  "/login",
  [body("email").isEmail(), body("password").isLength({ min: 6 })],
  function (req, res) {
    var errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });
    var email = req.body.email.toLowerCase();
    User.findOne({ email: email })
      .then(function (user) {
        if (!user)
          return res.status(401).json({ message: "Invalid credentials" });
        if (!user.isEmailVerified)
          return res.status(403).json({ message: "Email not verified" });
        return bcrypt
          .compare(req.body.password, user.passwordHash)
          .then(function (ok) {
            if (!ok)
              return res.status(401).json({ message: "Invalid credentials" });
            var token = jwt.sign(
              { sub: user._id },
              process.env.JWT_SECRET || "secret",
              { expiresIn: "7d" }
            );
            res.json({
              token: token,
              user: {
                id: user._id,
                email: user.email,
                plan: user.plan,
                name: user.name,
              },
            });
          });
      })
      .catch(function (err) {
        res.status(500).json({ message: err.message });
      });
  }
);

/** Google OAuth */
/**
 * @openapi
 * /api/auth/google:
 *   get:
 *     summary: Google OAuth login
 *     tags: [Auth]
 *     responses:
 *       302: { description: Redirect to Google }
 */
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/" }),
  function (req, res) {
    var token = jwt.sign(
      { sub: req.user._id },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "7d" }
    );
    // Save refresh token
    var refresh = uuidv4();
    User.findByIdAndUpdate(req.user._id, { refreshToken: refresh })
      .then(function () {
        var redirectUrl =
          (process.env.CLIENT_URL || "http://localhost:5173") +
          "/oauth-success?token=" +
          token +
          "&refresh=" +
          refresh;
        res.redirect(redirectUrl);
      })
      .catch(function () {
        var redirectUrl =
          (process.env.CLIENT_URL || "http://localhost:5173") +
          "/oauth-success?token=" +
          token;
        res.redirect(redirectUrl);
      });
  }
);

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Exchange refresh token for new JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: JWT }
 */
router.post("/refresh", function (req, res) {
  var refresh = req.body.refreshToken;
  if (!refresh)
    return res.status(400).json({ message: "Missing refreshToken" });
  User.findOne({ refreshToken: refresh })
    .then(function (user) {
      if (!user)
        return res.status(401).json({ message: "Invalid refresh token" });
      var token = jwt.sign(
        { sub: user._id },
        process.env.JWT_SECRET || "secret",
        { expiresIn: "7d" }
      );
      res.json({ token: token });
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

/** Forgot password - send code */
/**
 * @openapi
 * /api/auth/forgot:
 *   post:
 *     summary: Send reset code to email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *     responses:
 *       200: { description: Sent }
 */
router.post("/forgot", [body("email").isEmail()], function (req, res) {
  var email = req.body.email.toLowerCase();
  User.findOne({ email: email })
    .then(function (user) {
      if (!user) return res.status(404).json({ message: "User not found" });
      var code = uuidv4().slice(0, 6).toUpperCase();
      user.resetPasswordCode = code;
      return user.save().then(function () {
        return mailer.sendVerificationEmail(email, code).then(function () {
          res.json({ message: "Reset code sent to email" });
        });
      });
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

/** Reset password using code */
/**
 * @openapi
 * /api/auth/reset:
 *   post:
 *     summary: Reset password using email code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, newPassword]
 *             properties:
 *               email: { type: string }
 *               code: { type: string }
 *               newPassword: { type: string }
 *     responses:
 *       200: { description: Updated }
 */
router.post(
  "/reset",
  [
    body("email").isEmail(),
    body("code").isLength({ min: 6 }),
    body("newPassword").isLength({ min: 6 }),
  ],
  function (req, res) {
    User.findOne({ email: req.body.email.toLowerCase() })
      .then(function (user) {
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.resetPasswordCode !== req.body.code)
          return res.status(400).json({ message: "Invalid code" });
        return bcrypt.hash(req.body.newPassword, 10).then(function (hash) {
          user.passwordHash = hash;
          user.resetPasswordCode = undefined;
          return user.save().then(function () {
            res.json({ message: "Password updated" });
          });
        });
      })
      .catch(function (err) {
        res.status(500).json({ message: err.message });
      });
  }
);

/** Change password (logged in) */
/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     summary: Change password
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string }
 *     responses:
 *       200: { description: Changed }
 */
router.post(
  "/change-password",
  requireAuth,
  [
    body("currentPassword").isLength({ min: 6 }),
    body("newPassword").isLength({ min: 6 }),
  ],
  function (req, res) {
    bcrypt
      .compare(req.body.currentPassword, req.user.passwordHash || "")
      .then(function (ok) {
        if (!ok)
          return res
            .status(401)
            .json({ message: "Current password incorrect" });
        return bcrypt.hash(req.body.newPassword, 10).then(function (hash) {
          req.user.passwordHash = hash;
          return req.user.save().then(function () {
            res.json({ message: "Password changed" });
          });
        });
      })
      .catch(function (err) {
        res.status(500).json({ message: err.message });
      });
  }
);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Logout and revoke refresh token
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Logged out }
 */
router.post("/logout", requireAuth, function (req, res) {
  User.findByIdAndUpdate(req.user._id, { refreshToken: null })
    .then(function () {
      res.json({ message: "Logged out" });
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

module.exports = router;
