var express = require("express");
var router = express.Router();
var Mood = require("../models/Mood");
var { requireAuth } = require("../middlewares/auth");
var { requirePremium } = require("../middlewares/auth");
var dayjs = require("dayjs");

/**
 * @openapi
 * /api/moods:
 *   post:
 *     summary: Upsert mood for a date
 *     tags: [Moods]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date: { type: string }
 *               mood: { type: string }
 *               score: { type: number }
 *               notes: { type: string }
 *               stress: { type: number }
 *               anxiety: { type: number }
 *               energy: { type: number }
 *     responses:
 *       200: { description: Saved }
 */
router.post("/", requireAuth, function (req, res) {
  var date = req.body.date || dayjs().format("YYYY-MM-DD");
  var payload = {
    userId: req.user._id,
    date: date,
    mood: req.body.mood,
    score: req.body.score,
    notes: req.body.notes,
    stress: req.body.stress,
    anxiety: req.body.anxiety,
    energy: req.body.energy,
  };
  Mood.findOneAndUpdate({ userId: req.user._id, date: date }, payload, {
    upsert: true,
    new: true,
  })
    .then(function (doc) {
      res.json(doc);
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

/**
 * @openapi
 * /api/moods:
 *   get:
 *     summary: Get moods list in range
 *     tags: [Moods]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: start
 *         schema: { type: string }
 *       - in: query
 *         name: end
 *         schema: { type: string }
 *     responses:
 *       200: { description: List }
 */
router.get("/", requireAuth, function (req, res) {
  var start = req.query.start;
  var end = req.query.end;
  var filter = { userId: req.user._id };
  if (start && end) filter.date = { $gte: start, $lte: end };
  Mood.find(filter)
    .sort({ date: 1 })
    .then(function (list) {
      res.json(list);
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

/**
 * @openapi
 * /api/moods/insights:
 *   get:
 *     summary: Premium mood insights (weekly/monthly averages)
 *     tags: [Moods]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Insights }
 */
router.get("/insights", requireAuth, requirePremium, async function (req, res) {
  try {
    var now = dayjs();
    var weekStart = now.startOf("week").format("YYYY-MM-DD");
    var monthStart = now.startOf("month").format("YYYY-MM-DD");
    var userId = req.user._id;
    var [week, month] = await Promise.all([
      aggregateAvg(userId, weekStart),
      aggregateAvg(userId, monthStart),
    ]);
    res.json({ week: week, month: month });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function aggregateAvg(userId, startDate) {
  return require("../models/Mood")
    .aggregate([
      { $match: { userId: userId, date: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          score: { $avg: "$score" },
          stress: { $avg: "$stress" },
          anxiety: { $avg: "$anxiety" },
          energy: { $avg: "$energy" },
        },
      },
    ])
    .then(function (res) {
      return (
        res[0] || { score: null, stress: null, anxiety: null, energy: null }
      );
    });
}

module.exports = router;
