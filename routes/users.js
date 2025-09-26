var express = require("express");
var router = express.Router();
var { requireAuth } = require("../middlewares/auth");
var User = require("../models/User");
var Journal = require("../models/Journal");
var Mood = require("../models/Mood");

/* Get my profile */
/**
 * @openapi
 * /users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profile }
 */
router.get("/me", requireAuth, function (req, res) {
  res.json({
    id: req.user._id,
    email: req.user.email,
    name: req.user.name,
    plan: req.user.plan,
  });
});

/* Update my profile */
/**
 * @openapi
 * /users/me:
 *   put:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200: { description: Updated }
 */
router.put("/me", requireAuth, function (req, res) {
  var update = { name: req.body.name };
  User.findByIdAndUpdate(req.user._id, update, { new: true })
    .then(function (u) {
      res.json({ id: u._id, email: u.email, name: u.name, plan: u.plan });
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

/**
 * @openapi
 * /users/stats:
 *   get:
 *     summary: Get simple usage statistics for current user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Stats }
 */
router.get("/stats", requireAuth, async function (req, res) {
  try {
    var [journals, moods] = await Promise.all([
      Journal.countDocuments({ userId: req.user._id }),
      Mood.countDocuments({ userId: req.user._id }),
    ]);
    res.json({ totalJournals: journals, totalMoods: moods });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @openapi
 * /users/me:
 *   delete:
 *     summary: Delete my account and all data
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Deleted }
 */
router.delete("/me", requireAuth, async function (req, res) {
  try {
    await Promise.all([
      Journal.deleteMany({ userId: req.user._id }),
      Mood.deleteMany({ userId: req.user._id }),
    ]);
    await User.deleteOne({ _id: req.user._id });
    res.json({ message: "Account and data deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
