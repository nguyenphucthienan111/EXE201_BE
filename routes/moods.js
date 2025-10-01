var express = require("express");
var router = express.Router();
var Mood = require("../models/Mood");
var { requireAuth } = require("../middlewares/auth");
var { requirePremium } = require("../middlewares/auth");
var dayjs = require("dayjs");
var { generateMoodReflections, isAIAvailable } = require("../utils/aiService");

/**
 * @openapi
 * /api/moods:
 *   post:
 *     summary: "Track daily mood & mental index (Free & Premium: unlimited)"
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
 *     summary: "Advanced mood insights & trends (Premium only)"
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

/**
 * @openapi
 * /api/moods/calendar:
 *   get:
 *     summary: "Mood calendar with statistics (Free & Premium: full access)"
 *     tags: [Moods]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: number }
 *         description: Year (default current year)
 *       - in: query
 *         name: month
 *         schema: { type: number }
 *         description: Month 1-12 (default current month)
 *     responses:
 *       200:
 *         description: Mood calendar data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     calendar:
 *                       type: array
 *                       description: Array of mood data for calendar
 *                     stats:
 *                       type: object
 *                       description: Monthly mood statistics
 */
router.get("/calendar", requireAuth, async function (req, res) {
  try {
    const year = req.query.year || dayjs().year();
    const month = req.query.month || dayjs().month() + 1; // dayjs months are 0-indexed

    // Get start and end of month
    const startDate = dayjs(`${year}-${month}-01`).format("YYYY-MM-DD");
    const endDate = dayjs(`${year}-${month}-01`)
      .endOf("month")
      .format("YYYY-MM-DD");

    // Get all moods for the month
    const moods = await Mood.find({
      userId: req.user._id,
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 });

    // Format for calendar (fill missing dates)
    const calendarData = [];
    const moodMap = {};

    // Create mood lookup map
    moods.forEach((mood) => {
      moodMap[mood.date] = mood;
    });

    // Generate all days in month with mood data
    const daysInMonth = dayjs(`${year}-${month}-01`).daysInMonth();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = dayjs(
        `${year}-${month}-${day.toString().padStart(2, "0")}`
      ).format("YYYY-MM-DD");
      const mood = moodMap[date];

      calendarData.push({
        date: date,
        day: day,
        dayOfWeek: dayjs(date).day(), // 0 = Sunday, 1 = Monday, etc.
        hasMood: !!mood,
        mood: mood
          ? {
              mood: mood.mood,
              score: mood.score,
              stress: mood.stress,
              anxiety: mood.anxiety,
              energy: mood.energy,
              notes: mood.notes,
            }
          : null,
      });
    }

    // Calculate monthly statistics
    const stats = {
      totalEntries: moods.length,
      averageScore:
        moods.length > 0
          ? (
              moods.reduce((sum, m) => sum + (m.score || 0), 0) / moods.length
            ).toFixed(1)
          : 0,
      averageStress:
        moods.length > 0
          ? (
              moods.reduce((sum, m) => sum + (m.stress || 0), 0) / moods.length
            ).toFixed(1)
          : 0,
      averageAnxiety:
        moods.length > 0
          ? (
              moods.reduce((sum, m) => sum + (m.anxiety || 0), 0) / moods.length
            ).toFixed(1)
          : 0,
      averageEnergy:
        moods.length > 0
          ? (
              moods.reduce((sum, m) => sum + (m.energy || 0), 0) / moods.length
            ).toFixed(1)
          : 0,
      moodDistribution: getMoodDistribution(moods),
      streaks: getMoodStreaks(moods),
    };

    res.json({
      success: true,
      data: {
        calendar: calendarData,
        stats: stats,
        month: month,
        year: year,
      },
    });
  } catch (error) {
    console.error("Error getting mood calendar:", error);
    res.status(500).json({
      success: false,
      message: "Error getting mood calendar",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/moods/suggestions:
 *   post:
 *     summary: "Mood-based reflection questions (Free & Premium: available)"
 *     tags: [Moods]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mood:
 *                 type: string
 *                 description: Current mood type
 *     responses:
 *       200: { description: Mood-based suggestions }
 */
router.post("/suggestions", requireAuth, async function (req, res) {
  try {
    const { mood } = req.body;

    if (!mood) {
      return res.status(400).json({
        success: false,
        message: "Mood is required",
      });
    }

    const suggestions = await generateMoodReflections(mood.toLowerCase());

    res.json({
      success: true,
      data: {
        suggestions: suggestions,
        mood: mood,
        aiPowered: isAIAvailable(),
      },
    });
  } catch (error) {
    console.error("Error getting mood suggestions:", error);
    res.status(500).json({
      success: false,
      message: "Error getting mood suggestions",
      error: error.message,
    });
  }
});

// Helper functions for mood statistics
function getMoodDistribution(moods) {
  const distribution = {};
  moods.forEach((mood) => {
    const moodType = mood.mood || "unknown";
    distribution[moodType] = (distribution[moodType] || 0) + 1;
  });
  return distribution;
}

function getMoodStreaks(moods) {
  let currentStreak = 0;
  let longestStreak = 0;
  let lastDate = null;

  for (const mood of moods) {
    const currentDate = dayjs(mood.date);

    if (lastDate && currentDate.diff(lastDate, "day") === 1) {
      currentStreak++;
    } else {
      currentStreak = 1;
    }

    longestStreak = Math.max(longestStreak, currentStreak);
    lastDate = currentDate;
  }

  return {
    current: currentStreak,
    longest: longestStreak,
  };
}

module.exports = router;
