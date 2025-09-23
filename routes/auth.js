var express = require("express");
var router = express.Router();
var bcrypt = require("bcryptjs");
var jwt = require("jsonwebtoken");
var { body, validationResult } = require("express-validator");
var passport = require("passport");
var { v4: uuidv4 } = require("uuid");
var User = require("../models/User");
var mailer = require("../utils/mailer");

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register with email + password (Gmail allowed)
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
            return mailer.sendVerificationEmail(email, code).then(function () {
              res.json({
                message: "Registered. Check email for verification code.",
              });
            });
          });
        });
      })
      .catch(function (err) {
        res.status(500).json({ message: err.message });
      });
  }
);

/** Verify email code */
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
    var redirectUrl =
      (process.env.CLIENT_URL || "http://localhost:5173") +
      "/oauth-success?token=" +
      token;
    res.redirect(redirectUrl);
  }
);

module.exports = router;
