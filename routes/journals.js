var express = require("express");
var router = express.Router();
var Journal = require("../models/Journal");
var { requireAuth, requirePremium } = require("../middlewares/auth");
var {
  enforceJournalCreateLimit,
  trackJournalCreate,
  enforceBasicSuggestLimit,
  trackBasicSuggest,
} = require("../middlewares/freemium");
var {
  generateWritingPrompts,
  generateAdvancedPrompts,
  generateMoodReflections,
  analyzeSentiment,
  generateImprovementPlan,
  getAssistantResponse,
  analyzeKeywords,
  isAIAvailable,
} = require("../utils/aiService");

// Create journal entry
/**
 * @openapi
 * /api/journals:
 *   post:
 *     summary: "Create journal entry (Free: max 2/day, Premium: unlimited)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Journal entry title
 *                 example: "My reflection today"
 *               content:
 *                 type: string
 *                 description: Journal entry content
 *                 example: "Today was challenging but I learned a lot about myself..."
 *               mood:
 *                 type: string
 *                 description: Current mood
 *                 example: "reflective"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Tags for categorization
 *                 example: ["growth", "learning", "self-reflection"]
 *     responses:
 *       201:
 *         description: Journal created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 userId:
 *                   type: string
 *                 title:
 *                   type: string
 *                 content:
 *                   type: string
 *                 mood:
 *                   type: string
 *                 tags:
 *                   type: array
 *                   items:
 *                     type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Daily limit reached (Free users only)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Free plan limit reached: max 2 journal entries per day"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post("/", requireAuth, enforceJournalCreateLimit, function (req, res) {
  var data = Object.assign({}, req.body, { userId: req.user._id });
  new Journal(data)
    .save()
    .then(function (doc) {
      trackJournalCreate(req, res, function () {
        res.status(201).json(doc);
      });
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

/**
 * @openapi
 * /api/journals:
 *   get:
 *     summary: "Get journal entries (Free & Premium: unlimited access)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 10
 *         description: Number of entries per page
 *     responses:
 *       200:
 *         description: List of journal entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   title:
 *                     type: string
 *                   content:
 *                     type: string
 *                   mood:
 *                     type: string
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 */
// List (with simple pagination)
router.get("/", requireAuth, function (req, res) {
  var page = Number(req.query.page || 1);
  var limit = Number(req.query.limit || 10);
  Journal.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .then(function (list) {
      res.json(list);
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

// Get one
router.get("/:id", requireAuth, function (req, res) {
  Journal.findOne({ _id: req.params.id, userId: req.user._id })
    .then(function (doc) {
      if (!doc) return res.status(404).end();
      res.json(doc);
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

// Update
router.put("/:id", requireAuth, function (req, res) {
  Journal.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body,
    { new: true }
  )
    .then(function (doc) {
      if (!doc) return res.status(404).end();
      res.json(doc);
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

// Delete
router.delete("/:id", requireAuth, function (req, res) {
  Journal.deleteOne({ _id: req.params.id, userId: req.user._id })
    .then(function () {
      res.status(204).end();
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

// Premium content suggestions with advanced AI
/**
 * @openapi
 * /api/journals/suggest:
 *   post:
 *     summary: "Advanced AI writing suggestions (Premium: unlimited, specific topics)"
 *     tags: [Journals]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic:
 *                 type: string
 *                 enum: [gratitude, forgiveness, goals, reflection, stress_relief, self_discovery]
 *                 description: Specific topic for targeted suggestions
 *               mood:
 *                 type: string
 *                 description: Current mood for personalized prompts
 *               journalId:
 *                 type: string
 *                 description: Optional journal ID to save suggestions
 *     responses:
 *       200:
 *         description: Advanced AI-generated suggestions
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
 *                     suggestions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     topic:
 *                       type: string
 *                     aiPowered:
 *                       type: boolean
 *                     savedToJournal:
 *                       type: boolean
 */
router.post("/suggest", requireAuth, requirePremium, async function (req, res) {
  try {
    const { topic = "reflection", mood, journalId } = req.body;

    // Generate premium AI suggestions (unlimited, more sophisticated)
    const suggestions = await generateAdvancedPrompts(topic, mood); // Advanced prompts for premium users

    // Save suggestions to journal if requested
    let savedToJournal = false;
    if (journalId) {
      await Journal.findOneAndUpdate(
        { _id: journalId, userId: req.user._id },
        { suggestion: suggestions.join("\n\n") }
      );
      savedToJournal = true;
    }

    res.json({
      success: true,
      data: {
        suggestions: suggestions,
        topic: topic,
        mood: mood || null,
        aiPowered: isAIAvailable(),
        savedToJournal: savedToJournal,
      },
    });
  } catch (error) {
    console.error("Error generating premium suggestions:", error);
    res.status(500).json({
      success: false,
      message: "Error generating premium suggestions",
      error: error.message,
    });
  }
});

// Free/basic suggestions with daily cap - NOW WITH REAL AI
/**
 * @openapi
 * /api/journals/suggest-basic:
 *   post:
 *     summary: "AI writing suggestions (Free: 3/day, Premium: also available)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mood:
 *                 type: string
 *                 description: Current user mood (happy, sad, anxious, etc.)
 *               topic:
 *                 type: string
 *                 description: Optional topic focus (gratitude, reflection, stress)
 *     responses:
 *       200:
 *         description: AI-generated suggestions
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
 *                     suggestions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     aiPowered:
 *                       type: boolean
 *                     mood:
 *                       type: string
 *                     topic:
 *                       type: string
 */
router.post(
  "/suggest-basic",
  requireAuth,
  enforceBasicSuggestLimit,
  async function (req, res) {
    try {
      const { mood, topic } = req.body;

      // Generate AI-powered suggestions
      const suggestions = await generateWritingPrompts(mood, topic, false); // false = free user

      trackBasicSuggest(req, res, function () {
        res.json({
          success: true,
          data: {
            suggestions: suggestions,
            aiPowered: isAIAvailable(),
            mood: mood || null,
            topic: topic || null,
            remainingToday: 3, // TODO: Calculate from usage
          },
        });
      });
    } catch (error) {
      console.error("Error generating basic suggestions:", error);
      res.status(500).json({
        success: false,
        message: "Error generating suggestions",
        error: error.message,
      });
    }
  }
);

// Premium AI assistant for emotional support
/**
 * @openapi
 * /api/journals/assistant:
 *   post:
 *     summary: "AI mental health assistant (Premium only)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               question:
 *                 type: string
 *                 description: User's question or concern
 *               context:
 *                 type: object
 *                 description: Optional context (recent moods, journal entries)
 *     responses:
 *       200:
 *         description: AI assistant response
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
 *                     response:
 *                       type: string
 *                       description: AI assistant's supportive response
 *                     suggestions:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Practical suggestions
 *                     resources:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Optional mental health resources
 *                     aiPowered:
 *                       type: boolean
 */
router.post(
  "/assistant",
  requireAuth,
  requirePremium,
  async function (req, res) {
    try {
      const { question, context = {} } = req.body;

      if (!question) {
        return res.status(400).json({
          success: false,
          message: "Question is required",
        });
      }

      // Get user's recent context for better AI responses
      const recentJournals = await Journal.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(3)
        .select("content mood createdAt");

      const userContext = {
        ...context,
        recentJournals: recentJournals.map((j) => ({
          content: j.content?.substring(0, 200), // First 200 chars for context
          mood: j.mood,
          date: j.createdAt,
        })),
      };

      const assistantResponse = await getAssistantResponse(
        question,
        userContext
      );

      res.json({
        success: true,
        data: assistantResponse,
      });
    } catch (error) {
      console.error("Error in AI assistant:", error);
      res.status(500).json({
        success: false,
        message: "Error processing assistant request",
        error: error.message,
      });
    }
  }
);

// Premium AI sentiment analysis - REAL DEPRESSION/ANXIETY DETECTION
/**
 * @openapi
 * /api/journals/analyze:
 *   post:
 *     summary: "AI sentiment analysis - depression/anxiety detection (Premium only)"
 *     tags: [Journals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Journal content to analyze
 *               journalId:
 *                 type: string
 *                 description: Optional journal ID to save analysis
 *     responses:
 *       200:
 *         description: Detailed sentiment analysis with mental health indicators
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
 *                     sentiment:
 *                       type: object
 *                       properties:
 *                         score:
 *                           type: number
 *                         label:
 *                           type: string
 *                         confidence:
 *                           type: number
 *                     mentalHealthIndicators:
 *                       type: object
 *                       properties:
 *                         depressionSigns:
 *                           type: boolean
 *                         anxietySigns:
 *                           type: boolean
 *                         stressSigns:
 *                           type: boolean
 *                         riskLevel:
 *                           type: string
 *                           enum: [low, medium, high]
 *                     keywords:
 *                       type: object
 *                     recommendations:
 *                       type: array
 *                       items:
 *                         type: string
 *                     aiPowered:
 *                       type: boolean
 */
router.post("/analyze", requireAuth, requirePremium, async function (req, res) {
  try {
    const { content, journalId } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Content is required for analysis",
      });
    }

    // Perform advanced AI sentiment analysis
    const analysis = await analyzeSentiment(content);

    // Save analysis to journal if requested
    if (journalId) {
      await Journal.findOneAndUpdate(
        { _id: journalId, userId: req.user._id },
        {
          suggestion: `Analysis: ${analysis.sentiment.label} (${
            analysis.sentiment.score
          })\nRisk: ${
            analysis.mentalHealthIndicators.riskLevel
          }\nRecommendations: ${analysis.recommendations.join(", ")}`,
        }
      );
    }

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error("Error in sentiment analysis:", error);
    res.status(500).json({
      success: false,
      message: "Error analyzing content",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/journals/sync/{id}:
 *   post:
 *     summary: Đánh dấu nhật ký đã đồng bộ cloud (premium only)
 *     tags: [Journals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Đã đồng bộ nhật ký lên cloud
 */
router.post(
  "/sync/:id",
  requireAuth,
  requirePremium,
  async function (req, res) {
    const journalId = req.params.id;
    const updated = await Journal.findOneAndUpdate(
      { _id: journalId, userId: req.user._id },
      { cloudSynced: true },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Journal not found" });
    res.json({ message: "Journal synced to cloud", journal: updated });
  }
);

/**
 * @openapi
 * /api/journals/dashboard:
 *   get:
 *     summary: "Analytics dashboard with charts & insights (Premium only)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *           default: month
 *         description: Time period for analysis
 *     responses:
 *       200:
 *         description: Comprehensive dashboard data
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
 *                     period:
 *                       type: string
 *                     journalStats:
 *                       type: object
 *                     moodTrends:
 *                       type: object
 *                     keywordAnalysis:
 *                       type: object
 *                     sentimentTrends:
 *                       type: array
 *                     mentalHealthInsights:
 *                       type: object
 */
router.get(
  "/dashboard",
  requireAuth,
  requirePremium,
  async function (req, res) {
    try {
      const { period = "month" } = req.query;
      const dayjs = require("dayjs");
      const Mood = require("../models/Mood");

      // Calculate date range based on period
      let startDate;
      switch (period) {
        case "week":
          startDate = dayjs().subtract(7, "day").format("YYYY-MM-DD");
          break;
        case "quarter":
          startDate = dayjs().subtract(3, "month").format("YYYY-MM-DD");
          break;
        case "year":
          startDate = dayjs().subtract(1, "year").format("YYYY-MM-DD");
          break;
        default: // month
          startDate = dayjs().subtract(1, "month").format("YYYY-MM-DD");
      }

      // Get journal entries for period
      const journals = await Journal.find({
        userId: req.user._id,
        createdAt: { $gte: new Date(startDate) },
      }).sort({ createdAt: 1 });

      // Get mood entries for period
      const moods = await Mood.find({
        userId: req.user._id,
        date: { $gte: startDate },
      }).sort({ date: 1 });

      // Calculate journal statistics
      const journalStats = {
        totalEntries: journals.length,
        averageWordsPerEntry:
          journals.length > 0
            ? Math.round(
                journals.reduce(
                  (sum, j) => sum + (j.content?.split(" ").length || 0),
                  0
                ) / journals.length
              )
            : 0,
        writingFrequency: calculateWritingFrequency(journals, period),
        topTags: getTopTags(journals),
      };

      // Calculate mood trends
      const moodTrends = {
        averageScore:
          moods.length > 0
            ? (
                moods.reduce((sum, m) => sum + (m.score || 0), 0) / moods.length
              ).toFixed(1)
            : 0,
        averageStress:
          moods.length > 0
            ? (
                moods.reduce((sum, m) => sum + (m.stress || 0), 0) /
                moods.length
              ).toFixed(1)
            : 0,
        averageAnxiety:
          moods.length > 0
            ? (
                moods.reduce((sum, m) => sum + (m.anxiety || 0), 0) /
                moods.length
              ).toFixed(1)
            : 0,
        averageEnergy:
          moods.length > 0
            ? (
                moods.reduce((sum, m) => sum + (m.energy || 0), 0) /
                moods.length
              ).toFixed(1)
            : 0,
        trendDirection: calculateTrendDirection(moods),
        chartData: moods.map((m) => ({
          date: m.date,
          score: m.score,
          stress: m.stress,
          anxiety: m.anxiety,
          energy: m.energy,
        })),
      };

      // Keyword analysis
      const keywordAnalysis = analyzeKeywords(journals);

      // Generate mental health insights
      const mentalHealthInsights = {
        overallWellbeing: calculateOverallWellbeing(
          moodTrends,
          keywordAnalysis
        ),
        riskFactors: identifyRiskFactors(journals, moods),
        progressNotes: generateProgressNotes(journalStats, moodTrends),
        recommendations: keywordAnalysis.insights,
      };

      res.json({
        success: true,
        data: {
          period: period,
          dateRange: { start: startDate, end: dayjs().format("YYYY-MM-DD") },
          journalStats,
          moodTrends,
          keywordAnalysis,
          mentalHealthInsights,
        },
      });
    } catch (error) {
      console.error("Error generating dashboard:", error);
      res.status(500).json({
        success: false,
        message: "Error generating dashboard",
        error: error.message,
      });
    }
  }
);

/**
 * @openapi
 * /api/journals/improvement-plan:
 *   post:
 *     summary: "Personalized wellness improvement plan (Premium only)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               focusAreas:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [anxiety, depression, stress, self_esteem, relationships]
 *               duration:
 *                 type: number
 *                 default: 7
 *                 description: Plan duration in days
 *     responses:
 *       200:
 *         description: Personalized improvement plan
 */
router.post(
  "/improvement-plan",
  requireAuth,
  requirePremium,
  async function (req, res) {
    try {
      const { focusAreas = [], duration = 7 } = req.body;
      const dayjs = require("dayjs");
      const Mood = require("../models/Mood");

      // Get user's recent data for personalization
      const recentJournals = await Journal.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(10);

      const recentMoods = await Mood.find({
        userId: req.user._id,
        date: { $gte: dayjs().subtract(30, "day").format("YYYY-MM-DD") },
      });

      // Create user profile for AI
      const userProfile = {
        averageMoodScore:
          recentMoods.length > 0
            ? recentMoods.reduce((sum, m) => sum + (m.score || 0), 0) /
              recentMoods.length
            : 5,
        averageStress:
          recentMoods.length > 0
            ? recentMoods.reduce((sum, m) => sum + (m.stress || 0), 0) /
              recentMoods.length
            : 5,
        averageAnxiety:
          recentMoods.length > 0
            ? recentMoods.reduce((sum, m) => sum + (m.anxiety || 0), 0) /
              recentMoods.length
            : 5,
        journalFrequency: recentJournals.length,
        focusAreas: focusAreas,
      };

      // Analyze recent journal entries
      const recentAnalyses = [];
      for (const journal of recentJournals.slice(0, 5)) {
        if (journal.content) {
          const analysis = await analyzeSentiment(journal.content);
          recentAnalyses.push({
            date: journal.createdAt,
            sentiment: analysis.sentiment,
            riskLevel: analysis.mentalHealthIndicators.riskLevel,
          });
        }
      }

      // Generate personalized improvement plan
      const improvementPlan = await generateImprovementPlan(
        userProfile,
        recentAnalyses
      );

      res.json({
        success: true,
        data: {
          plan: improvementPlan,
          basedOn: {
            journalEntries: recentJournals.length,
            moodEntries: recentMoods.length,
            userProfile: userProfile,
          },
        },
      });
    } catch (error) {
      console.error("Error generating improvement plan:", error);
      res.status(500).json({
        success: false,
        message: "Error generating improvement plan",
        error: error.message,
      });
    }
  }
);

// Helper functions for dashboard
function calculateWritingFrequency(journals, period) {
  const days =
    period === "week"
      ? 7
      : period === "month"
      ? 30
      : period === "quarter"
      ? 90
      : 365;
  return ((journals.length / days) * 7).toFixed(1); // entries per week
}

function getTopTags(journals) {
  const tagCount = {};
  journals.forEach((journal) => {
    (journal.tags || []).forEach((tag) => {
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    });
  });
  return Object.entries(tagCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
}

function calculateTrendDirection(moods) {
  if (moods.length < 2) return "stable";

  const recent = moods.slice(-7); // Last 7 entries
  const older = moods.slice(-14, -7); // Previous 7 entries

  if (recent.length === 0 || older.length === 0) return "stable";

  const recentAvg =
    recent.reduce((sum, m) => sum + (m.score || 0), 0) / recent.length;
  const olderAvg =
    older.reduce((sum, m) => sum + (m.score || 0), 0) / older.length;

  const diff = recentAvg - olderAvg;

  if (diff > 0.5) return "improving";
  if (diff < -0.5) return "declining";
  return "stable";
}

function calculateOverallWellbeing(moodTrends, keywordAnalysis) {
  const moodScore = parseFloat(moodTrends.averageScore) || 5;
  const stressScore = 10 - (parseFloat(moodTrends.averageStress) || 5);
  const anxietyScore = 10 - (parseFloat(moodTrends.averageAnxiety) || 5);
  const energyScore = parseFloat(moodTrends.averageEnergy) || 5;

  const keywordScore = keywordAnalysis.emotionalBalance
    ? parseFloat(keywordAnalysis.emotionalBalance.positiveRatio) / 10
    : 5;

  const overall = (
    (moodScore + stressScore + anxietyScore + energyScore + keywordScore) /
    5
  ).toFixed(1);

  let status;
  if (overall >= 7) status = "excellent";
  else if (overall >= 6) status = "good";
  else if (overall >= 4) status = "fair";
  else status = "needs_attention";

  return { score: overall, status };
}

function identifyRiskFactors(journals, moods) {
  const factors = [];

  // Check for concerning patterns
  if (moods.some((m) => m.anxiety >= 8)) {
    factors.push("High anxiety levels detected");
  }

  if (moods.some((m) => m.stress >= 8)) {
    factors.push("High stress levels detected");
  }

  const keywordAnalysis = analyzeKeywords(journals);
  if (keywordAnalysis.categoryFrequency.depression > 3) {
    factors.push("Frequent mention of depressive feelings");
  }

  return factors;
}

function generateProgressNotes(journalStats, moodTrends) {
  const notes = [];

  if (journalStats.totalEntries > 10) {
    notes.push("✅ Great job maintaining a consistent journaling practice!");
  }

  if (moodTrends.trendDirection === "improving") {
    notes.push("📈 Your mood scores show positive improvement over time!");
  } else if (moodTrends.trendDirection === "declining") {
    notes.push(
      "📉 Consider focusing on self-care as mood trends show some concern."
    );
  }

  if (parseFloat(moodTrends.averageEnergy) >= 7) {
    notes.push("⚡ Your energy levels are consistently good!");
  }

  return notes;
}

/**
 * @openapi
 * /api/journals/usage:
 *   get:
 *     summary: "Daily usage tracking (Free & Premium: monitor limits)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Current usage statistics
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
 *                     plan:
 *                       type: string
 *                     dailyLimits:
 *                       type: object
 *                     usage:
 *                       type: object
 *                     remaining:
 *                       type: object
 */
router.get("/usage", requireAuth, async function (req, res) {
  try {
    const User = require("../models/User");
    const Usage = require("../models/Usage");
    const dayjs = require("dayjs");

    const user = await User.findById(req.user._id);
    const today = dayjs().format("YYYY-MM-DD");
    const usage = (await Usage.findOne({
      userId: req.user._id,
      date: today,
    })) || { createdJournals: 0, basicSuggestionsUsed: 0 };

    const limits =
      user.plan === "premium"
        ? {
            journals: "unlimited",
            suggestions: "unlimited",
          }
        : {
            journals: 2,
            suggestions: 3,
          };

    const remaining =
      user.plan === "premium"
        ? {
            journals: "unlimited",
            suggestions: "unlimited",
          }
        : {
            journals: Math.max(0, limits.journals - usage.createdJournals),
            suggestions: Math.max(
              0,
              limits.suggestions - usage.basicSuggestionsUsed
            ),
          };

    res.json({
      success: true,
      data: {
        plan: user.plan,
        dailyLimits: limits,
        usage: {
          journals: usage.createdJournals || 0,
          suggestions: usage.basicSuggestionsUsed || 0,
        },
        remaining: remaining,
        date: today,
      },
    });
  } catch (error) {
    console.error("Error getting usage:", error);
    res.status(500).json({
      success: false,
      message: "Error getting usage",
      error: error.message,
    });
  }
});

module.exports = router;
