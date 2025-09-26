var express = require("express");
var router = express.Router();
var { requireAuth } = require("../middlewares/auth");
var User = require("../models/User");

// Upgrade/downgrade plan (mock, integrate payment later)
/**
 * @openapi
 * /api/plans/set:
 *   post:
 *     summary: Set current user's plan (mock)
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan: { type: string, enum: [free, premium] }
 *     responses:
 *       200: { description: Updated plan }
 */
router.post("/set", requireAuth, function (req, res) {
  var plan = req.body.plan === "premium" ? "premium" : "free";
  User.findByIdAndUpdate(req.user._id, { plan: plan }, { new: true })
    .then(function (user) {
      res.json({ plan: user.plan });
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

/**
 * @openapi
 * /api/plans/me:
 *   get:
 *     summary: Get my current plan
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Plan }
 */
router.get("/me", requireAuth, function (req, res) {
  res.json({ plan: req.user.plan });
});

module.exports = router;
