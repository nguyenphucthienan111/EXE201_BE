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
var crypto = require("crypto");

const REFRESH_TOKEN_MAX_AGE_DAYS_RAW = Number.parseInt(
  process.env.REFRESH_TOKEN_DAYS || "30",
  10
);
const REFRESH_TOKEN_MAX_AGE_DAYS =
  Number.isFinite(REFRESH_TOKEN_MAX_AGE_DAYS_RAW) &&
  REFRESH_TOKEN_MAX_AGE_DAYS_RAW > 0
    ? REFRESH_TOKEN_MAX_AGE_DAYS_RAW
    : 30;

function issueAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET || "secret", {
    expiresIn: "7d",
  });
}

function createRefreshTokenPayload() {
  const tokenId = uuidv4();
  const secret = crypto.randomBytes(48).toString("hex");
  const token = `${tokenId}.${secret}`;
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  );
  return { token, tokenId, secret, expiresAt };
}

function setRefreshCookie(res, token, expiresAt) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires: expiresAt,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
}

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
 *               rememberMe: {
 *                 type: boolean,
 *                 description: "If true, issues a long-lived refresh token stored as HttpOnly cookie",
 *                 default: false,
 *               }
 *     responses:
 *       200: { description: JWT issued }
 */
router.post(
  "/login",
  [body("email").isEmail(), body("password").isLength({ min: 6 })],
  async function (req, res) {
    var errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    try {
      const email = req.body.email.toLowerCase();
      const remember = Boolean(req.body.rememberMe);

      const user = await User.findOne({ email: email });
      if (!user)
        return res.status(401).json({ message: "Invalid credentials" });
      if (!user.isEmailVerified)
        return res.status(403).json({ message: "Email not verified" });

      const ok = await bcrypt.compare(req.body.password, user.passwordHash);
      if (!ok) return res.status(401).json({ message: "Invalid credentials" });

      const accessToken = issueAccessToken(user._id);

      if (remember) {
        const { token, tokenId, secret, expiresAt } =
          createRefreshTokenPayload();
        await user.setRefreshToken(secret, expiresAt, tokenId);
        await user.save();
        setRefreshCookie(res, token, expiresAt);
      } else {
        user.clearRefreshToken();
        await user.save();
        clearRefreshCookie(res);
      }

      res.json({
        accessToken,
        token: accessToken,
        user: {
          id: user._id,
          email: user.email,
          plan: user.plan,
          role: user.role,
          name: user.name,
          avatar: user.avatar,
        },
      });
    } catch (err) {
      console.error("Login error", err);
      res.status(500).json({ message: err.message });
    }
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
router.post("/refresh", async function (req, res) {
  try {
    const cookieToken = req.cookies?.refresh_token;
    if (!cookieToken)
      return res.status(400).json({ message: "Missing refresh token" });

    const parts = cookieToken.split(".");
    if (parts.length !== 2)
      return res.status(400).json({ message: "Invalid refresh token format" });

    const [tokenId, secret] = parts;

    const user = await User.findOne({ refreshTokenId: tokenId });
    if (!user)
      return res.status(401).json({ message: "Invalid refresh token" });

    const isValid = await user.validateRefreshToken(secret, tokenId);
    if (!isValid)
      return res.status(401).json({ message: "Invalid refresh token" });

    const accessToken = issueAccessToken(user._id);

    const {
      token,
      tokenId: newId,
      secret: newSecret,
      expiresAt,
    } = createRefreshTokenPayload();
    await user.setRefreshToken(newSecret, expiresAt, newId);
    await user.save();
    setRefreshCookie(res, token, expiresAt);

    res.json({ accessToken, token: accessToken });
  } catch (err) {
    console.error("Refresh error", err);
    res.status(500).json({ message: err.message });
  }
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
        console.log(`[DEBUG] Reset code generated for ${email}: ${code}`);
        return mailer.sendVerificationEmail(email, code).then(function () {
          var payload = { message: "Reset code sent to email" };
          if (process.env.NODE_ENV !== "production") {
            payload.devResetCode = code;
          }
          res.json(payload);
        });
      });
    })
    .catch(function (err) {
      console.error("[ERROR] Forgot password error:", err.message);
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
    var email = req.body.email.toLowerCase();
    var code = req.body.code.toUpperCase();
    var newPassword = req.body.newPassword;

    console.log(`[DEBUG] Reset attempt for ${email} with code: ${code}`);

    User.findOne({ email: email })
      .then(function (user) {
        if (!user) {
          console.log(`[DEBUG] User not found: ${email}`);
          return res.status(404).json({ message: "User not found" });
        }

        console.log(
          `[DEBUG] User found, stored code: ${user.resetPasswordCode}, received: ${code}`
        );

        if (!user.resetPasswordCode) {
          console.log(`[DEBUG] No reset code found for user: ${email}`);
          return res.status(400).json({
            message: "No reset code found. Please request a new one.",
          });
        }

        if (user.resetPasswordCode !== code) {
          console.log(`[DEBUG] Code mismatch for ${email}`);
          return res.status(400).json({ message: "Invalid code" });
        }

        return bcrypt.hash(newPassword, 10).then(function (hash) {
          user.passwordHash = hash;
          user.resetPasswordCode = undefined;
          return user.save().then(function () {
            console.log(`[DEBUG] Password updated successfully for ${email}`);
            res.json({ message: "Password updated" });
          });
        });
      })
      .catch(function (err) {
        console.error("[ERROR] Reset password error:", err.message);
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
router.post("/logout", requireAuth, async function (req, res) {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.clearRefreshToken();
      await user.save();
    }
    clearRefreshCookie(res);
    res.json({ message: "Logged out" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
