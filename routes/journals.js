var express = require("express");
var router = express.Router();
var Journal = require("../models/Journal");
var JournalTemplate = require("../models/JournalTemplate");
var AIAnalysis = require("../models/AIAnalysis");
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
  analyzeEmotionAndSentiment,
  performMentalHealthAssessment,
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
 *                 description: Journal entry content (plain text)
 *                 example: "Today was challenging but I learned a lot about myself..."
 *               richContent:
 *                 type: string
 *                 description: Rich text content (HTML)
 *                 example: "<p>Today was <strong>challenging</strong> but I learned a lot about myself...</p>"
 *               templateId:
 *                 type: string
 *                 description: Template ID to use for this journal
 *                 example: "60f7b3b3b3b3b3b3b3b3b3b3"
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
router.post(
  "/",
  requireAuth,
  enforceJournalCreateLimit,
  async function (req, res) {
    try {
      const { templateId, richContent, ...otherData } = req.body;

      // Validate template access if templateId is provided
      if (templateId) {
        const template = await JournalTemplate.findById(templateId);
        if (!template) {
          return res.status(404).json({
            success: false,
            message: "Template not found",
          });
        }

        // Check template access permissions
        if (template.category === "premium" && req.user.plan !== "premium") {
          return res.status(403).json({
            success: false,
            message: "Premium subscription required for this template",
          });
        }

        if (
          template.category === "user" &&
          template.uploadedBy.toString() !== req.user.id
        ) {
          return res.status(403).json({
            success: false,
            message: "You can only use your own custom templates",
          });
        }

        // Increment template usage
        await JournalTemplate.incrementUsage(templateId);
      }

      const data = {
        ...otherData,
        userId: req.user._id,
        templateId: templateId || null,
        templateName: templateId
          ? (await JournalTemplate.findById(templateId))?.name
          : "Default",
        richContent: richContent || "",
        // Keep plain text content for backward compatibility
        content: otherData.content || "",
      };

      const journal = new Journal(data);
      await journal.save();

      trackJournalCreate(req, res, function () {
        res.status(201).json({
          success: true,
          data: journal,
        });
      });
    } catch (error) {
      console.error("Error creating journal:", error);
      res.status(500).json({
        success: false,
        message: "Error creating journal entry",
        error: error.message,
      });
    }
  }
);

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
    })) || {
      createdJournals: 0,
      basicSuggestionsUsed: 0,
    };

    const limits =
      user.plan === "premium"
        ? { journals: "unlimited", suggestions: "unlimited" }
        : { journals: 2, suggestions: 3 };

    const remaining =
      user.plan === "premium"
        ? { journals: "unlimited", suggestions: "unlimited" }
        : {
            journals: Math.max(
              0,
              limits.journals - (usage.createdJournals || 0)
            ),
            suggestions: Math.max(
              0,
              limits.suggestions - (usage.basicSuggestionsUsed || 0)
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
/**
 * @openapi
 * /api/journals/{id}:
 *   put:
 *     summary: "Update journal entry (Free & Premium)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               content: { type: string }
 *               richContent: { type: string, description: "HTML content" }
 *               templateId: { type: string }
 *               mood: { type: string }
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Updated entry (ownership enforced)
 *       404:
 *         description: Not found or not owned by user
 */
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
/**
 * @openapi
 * /api/journals/{id}:
 *   delete:
 *     summary: "Delete journal entry (Free & Premium)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Deleted successfully
 *       404:
 *         description: Not found or not owned by user
 */
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
 *               journalId:
 *                 type: string
 *                 description: Optional journal ID to save suggestions to
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
      const { mood, topic, journalId } = req.body;

      // Generate AI-powered suggestions
      const suggestions = await generateWritingPrompts(mood, topic, false); // false = free user

      // Save suggestions to journal if requested
      let savedToJournal = false;
      if (journalId) {
        await Journal.findOneAndUpdate(
          { _id: journalId, userId: req.user._id },
          { suggestion: suggestions.join("\n\n") }
        );
        savedToJournal = true;
      }

      trackBasicSuggest(req, res, function () {
        res.json({
          success: true,
          data: {
            suggestions: suggestions,
            aiPowered: isAIAvailable(),
            mood: mood || null,
            topic: topic || null,
            remainingToday: 3, // TODO: Calculate from usage
            savedToJournal: savedToJournal,
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

// AI Emotion Analysis for Premium Users
/**
 * @openapi
 * /api/journals/emotion-analysis:
 *   post:
 *     summary: "AI Emotion Analysis - Analyze feelings and provide improvement suggestions (Premium only)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
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
 *                 example: "Today I felt really stressed about work and couldn't sleep well..."
 *               journalId:
 *                 type: string
 *                 description: Optional journal ID to save analysis results
 *                 example: "60f7b3b3b3b3b3b3b3b3b3b3"
 *     responses:
 *       200:
 *         description: Emotion analysis completed successfully
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
 *                     emotionAnalysis:
 *                       type: object
 *                       properties:
 *                         primaryEmotion:
 *                           type: string
 *                           example: "anxiety"
 *                         emotionScore:
 *                           type: number
 *                           example: 7.5
 *                         confidence:
 *                           type: number
 *                           example: 0.85
 *                     sentimentAnalysis:
 *                       type: object
 *                       properties:
 *                         overallSentiment:
 *                           type: string
 *                           example: "negative"
 *                         sentimentScore:
 *                           type: number
 *                           example: -0.3
 *                     mentalHealthIndicators:
 *                       type: object
 *                       properties:
 *                         stressLevel:
 *                           type: string
 *                           enum: [low, moderate, high, very_high]
 *                         anxietyLevel:
 *                           type: string
 *                           enum: [low, moderate, high, very_high]
 *                         depressionSigns:
 *                           type: boolean
 *                         riskLevel:
 *                           type: string
 *                           enum: [low, medium, high]
 *                     improvementSuggestions:
 *                       type: object
 *                       properties:
 *                         immediateActions:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["Take 5 deep breaths", "Go for a 10-minute walk"]
 *                         shortTermGoals:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["Practice meditation daily", "Get 8 hours of sleep"]
 *                         longTermStrategies:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["Consider therapy", "Develop stress management routine"]
 *                         timeframes:
 *                           type: object
 *                           properties:
 *                             immediate:
 *                               type: string
 *                               example: "Next 30 minutes"
 *                             shortTerm:
 *                               type: string
 *                               example: "Next 1-2 weeks"
 *                             longTerm:
 *                               type: string
 *                               example: "Next 1-3 months"
 *                     keywords:
 *                       type: object
 *                       properties:
 *                         emotional:
 *                           type: array
 *                           items:
 *                             type: string
 *                         behavioral:
 *                           type: array
 *                           items:
 *                             type: string
 *                         physical:
 *                           type: array
 *                           items:
 *                             type: string
 *                     aiPowered:
 *                       type: boolean
 *       400:
 *         description: Bad request - content required
 *       403:
 *         description: Premium subscription required
 *       500:
 *         description: Server error
 */
router.post(
  "/emotion-analysis",
  requireAuth,
  requirePremium,
  async function (req, res) {
    try {
      const { content, journalId } = req.body;

      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Content is required for emotion analysis",
        });
      }

      // Perform comprehensive emotion analysis
      const emotionAnalysis = await analyzeEmotionAndSentiment(content);

      // Save analysis to database
      const savedAnalysis = new AIAnalysis({
        userId: req.user._id,
        journalId: journalId || null,
        analysisType: "emotion",
        content: content,
        results: emotionAnalysis,
        aiPowered: emotionAnalysis.aiPowered,
      });
      await savedAnalysis.save();

      // Save analysis to journal if requested
      if (journalId) {
        await Journal.findOneAndUpdate(
          { _id: journalId, userId: req.user._id },
          {
            emotionAnalysis: {
              analyzedAt: new Date(),
              primaryEmotion: emotionAnalysis.emotionAnalysis.primaryEmotion,
              emotionScore: emotionAnalysis.emotionAnalysis.emotionScore,
              riskLevel: emotionAnalysis.mentalHealthIndicators.riskLevel,
              suggestions:
                emotionAnalysis.improvementSuggestions.immediateActions,
            },
          }
        );
      }

      res.json({
        success: true,
        data: {
          ...emotionAnalysis,
          analysisId: savedAnalysis._id,
          savedAt: savedAnalysis.createdAt,
        },
      });
    } catch (error) {
      console.error("Error in emotion analysis:", error);
      res.status(500).json({
        success: false,
        message: "Error analyzing emotions",
        error: error.message,
      });
    }
  }
);

// AI Mental Health Assessment for Premium Users
/**
 * @openapi
 * /api/journals/mental-health-assessment:
 *   post:
 *     summary: "AI Mental Health Assessment - Comprehensive mental health evaluation (Premium only)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Journal content to assess
 *                 example: "I've been feeling really down lately and having trouble sleeping..."
 *               journalId:
 *                 type: string
 *                 description: Optional journal ID to save assessment results
 *                 example: "60f7b3b3b3b3b3b3b3b3b3b3"
 *     responses:
 *       200:
 *         description: Mental health assessment completed successfully
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
 *                     assessment:
 *                       type: object
 *                       properties:
 *                         overallScore:
 *                           type: number
 *                           example: 6.2
 *                         mentalHealthStatus:
 *                           type: string
 *                           enum: [excellent, good, fair, concerning, critical]
 *                         assessmentDate:
 *                           type: string
 *                           format: date-time
 *                     depressionIndicators:
 *                       type: object
 *                       properties:
 *                         score:
 *                           type: number
 *                           example: 7.5
 *                         level:
 *                           type: string
 *                           enum: [minimal, mild, moderate, severe]
 *                         symptoms:
 *                           type: array
 *                           items:
 *                             type: string
 *                         recommendations:
 *                           type: array
 *                           items:
 *                             type: string
 *                     anxietyIndicators:
 *                       type: object
 *                       properties:
 *                         score:
 *                           type: number
 *                           example: 6.8
 *                         level:
 *                           type: string
 *                           enum: [minimal, mild, moderate, severe]
 *                         symptoms:
 *                           type: array
 *                           items:
 *                             type: string
 *                         recommendations:
 *                           type: array
 *                           items:
 *                             type: string
 *                     stressIndicators:
 *                       type: object
 *                       properties:
 *                         score:
 *                           type: number
 *                           example: 8.2
 *                         level:
 *                           type: string
 *                           enum: [low, moderate, high, very_high]
 *                         sources:
 *                           type: array
 *                           items:
 *                             type: string
 *                         recommendations:
 *                           type: array
 *                           items:
 *                             type: string
 *                     riskAssessment:
 *                       type: object
 *                       properties:
 *                         overallRisk:
 *                           type: string
 *                           enum: [low, medium, high, very_high]
 *                         immediateConcerns:
 *                           type: array
 *                           items:
 *                             type: string
 *                         followUpNeeded:
 *                           type: boolean
 *                         professionalHelpRecommended:
 *                           type: boolean
 *                     personalizedPlan:
 *                       type: object
 *                       properties:
 *                         dailyActions:
 *                           type: array
 *                           items:
 *                             type: string
 *                         weeklyGoals:
 *                           type: array
 *                           items:
 *                             type: string
 *                         monthlyObjectives:
 *                           type: array
 *                           items:
 *                             type: string
 *                         resources:
 *                           type: array
 *                           items:
 *                             type: string
 *                     aiPowered:
 *                       type: boolean
 *       400:
 *         description: Bad request - content required
 *       403:
 *         description: Premium subscription required
 *       500:
 *         description: Server error
 */
router.post(
  "/mental-health-assessment",
  requireAuth,
  requirePremium,
  async function (req, res) {
    try {
      const { content, journalId } = req.body;

      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Content is required for mental health assessment",
        });
      }

      // Perform comprehensive mental health assessment
      const assessment = await performMentalHealthAssessment(content);

      // Save assessment to database
      const savedAssessment = new AIAnalysis({
        userId: req.user._id,
        journalId: journalId || null,
        analysisType: "mental_health",
        content: content,
        results: assessment,
        aiPowered: assessment.aiPowered,
      });
      await savedAssessment.save();

      // Save assessment to journal if requested
      if (journalId) {
        await Journal.findOneAndUpdate(
          { _id: journalId, userId: req.user._id },
          {
            mentalHealthAssessment: {
              assessedAt: new Date(),
              overallScore: assessment.assessment.overallScore,
              mentalHealthStatus: assessment.assessment.mentalHealthStatus,
              riskLevel: assessment.riskAssessment.overallRisk,
              professionalHelpRecommended:
                assessment.riskAssessment.professionalHelpRecommended,
            },
          }
        );
      }

      res.json({
        success: true,
        data: {
          ...assessment,
          analysisId: savedAssessment._id,
          savedAt: savedAssessment.createdAt,
        },
      });
    } catch (error) {
      console.error("Error in mental health assessment:", error);
      res.status(500).json({
        success: false,
        message: "Error performing mental health assessment",
        error: error.message,
      });
    }
  }
);

// Get AI Analysis History
/**
 * @openapi
 * /api/journals/ai-analysis/history:
 *   get:
 *     summary: "Get AI analysis history (Premium only)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [emotion, mental_health, all]
 *           default: all
 *         description: Filter by analysis type
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: Number of results per page
 *     responses:
 *       200:
 *         description: AI analysis history retrieved successfully
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
 *                     analyses:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                     stats:
 *                       type: object
 *       403:
 *         description: Premium subscription required
 *       500:
 *         description: Server error
 */
router.get(
  "/ai-analysis/history",
  requireAuth,
  requirePremium,
  async function (req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const type = req.query.type || "all";
      const skip = (page - 1) * limit;

      // Build query
      let query = { userId: req.user._id };
      if (type !== "all") {
        query.analysisType = type;
      }

      // Get analyses with pagination
      const [analyses, totalCount] = await Promise.all([
        AIAnalysis.getUserAnalysisHistory(
          req.user._id,
          type === "all" ? null : type,
          limit,
          skip
        ),
        AIAnalysis.countDocuments(query),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      // Get statistics
      const stats = await AIAnalysis.getAnalysisStats(req.user._id);

      res.json({
        success: true,
        data: {
          analyses: analyses.map((analysis) => ({
            id: analysis._id,
            type: analysis.analysisType,
            content:
              analysis.content.substring(0, 200) +
              (analysis.content.length > 200 ? "..." : ""),
            results: analysis.results,
            aiPowered: analysis.aiPowered,
            createdAt: analysis.createdAt,
            journalTitle: analysis.journalId?.title || null,
            journalDate: analysis.journalId?.createdAt || null,
          })),
          pagination: {
            currentPage: page,
            totalPages,
            totalCount,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
          stats: stats.reduce((acc, stat) => {
            acc[stat._id] = {
              count: stat.count,
              lastAnalysis: stat.lastAnalysis,
            };
            return acc;
          }, {}),
        },
      });
    } catch (error) {
      console.error("Error getting AI analysis history:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving analysis history",
        error: error.message,
      });
    }
  }
);

// Get recent AI analyses (MUST be before /:id route to avoid conflict)
/**
 * @openapi
 * /api/journals/ai-analysis/recent:
 *   get:
 *     summary: "Get recent AI analyses (Premium only)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *           maximum: 20
 *         description: Number of recent analyses to retrieve
 *     responses:
 *       200:
 *         description: Recent AI analyses retrieved successfully
 *       403:
 *         description: Premium subscription required
 *       500:
 *         description: Server error
 */
router.get(
  "/ai-analysis/recent",
  requireAuth,
  requirePremium,
  async function (req, res) {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 5, 20);

      const recentAnalyses = await AIAnalysis.getRecentAnalysis(
        req.user._id,
        limit
      );

      res.json({
        success: true,
        data: {
          analyses: recentAnalyses.map((analysis) => ({
            id: analysis._id,
            type: analysis.analysisType,
            results: analysis.results,
            aiPowered: analysis.aiPowered,
            createdAt: analysis.createdAt,
            journalTitle: analysis.journalId?.title || null,
          })),
          count: recentAnalyses.length,
        },
      });
    } catch (error) {
      console.error("Error getting recent AI analyses:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving recent analyses",
        error: error.message,
      });
    }
  }
);

// Get specific AI analysis
/**
 * @openapi
 * /api/journals/ai-analysis/{id}:
 *   get:
 *     summary: "Get specific AI analysis details (Premium only)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Analysis ID
 *     responses:
 *       200:
 *         description: AI analysis details retrieved successfully
 *       404:
 *         description: Analysis not found
 *       403:
 *         description: Premium subscription required
 *       500:
 *         description: Server error
 */
router.get(
  "/ai-analysis/:id",
  requireAuth,
  requirePremium,
  async function (req, res) {
    try {
      const { id } = req.params;

      // Validate ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          message: "Invalid analysis ID format",
        });
      }

      const analysis = await AIAnalysis.findOne({
        _id: id,
        userId: req.user._id,
      }).populate("journalId", "title content createdAt");

      if (!analysis) {
        return res.status(404).json({
          success: false,
          message: "Analysis not found",
        });
      }

      res.json({
        success: true,
        data: {
          id: analysis._id,
          type: analysis.analysisType,
          content: analysis.content,
          results: analysis.results,
          aiPowered: analysis.aiPowered,
          createdAt: analysis.createdAt,
          updatedAt: analysis.updatedAt,
          journal: analysis.journalId
            ? {
                id: analysis.journalId._id,
                title: analysis.journalId.title,
                content: analysis.journalId.content,
                createdAt: analysis.journalId.createdAt,
              }
            : null,
        },
      });
    } catch (error) {
      console.error("Error getting AI analysis:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving analysis",
        error: error.message,
      });
    }
  }
);

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

/**
 * @openapi
 * /api/journals/{id}/print:
 *   post:
 *     summary: "Generate print-ready journal entry"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paperSize:
 *                 type: string
 *                 enum: [A4, A5, Letter, Legal]
 *                 default: A4
 *               printQuality:
 *                 type: string
 *                 enum: [Draft, Standard, High Quality]
 *                 default: Standard
 *               colorOptions:
 *                 type: string
 *                 enum: [Color, Black and White]
 *                 default: Color
 *               copies:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 default: 1
 *     responses:
 *       200:
 *         description: Print data generated successfully
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
 *                     printData:
 *                       type: object
 *                     settings:
 *                       type: object
 *       403:
 *         description: Access denied
 *       404:
 *         description: Journal not found
 *       500:
 *         description: Server error
 */
router.post("/:id/print", requireAuth, async function (req, res) {
  try {
    const { id } = req.params;
    const {
      paperSize = "A4",
      printQuality = "Standard",
      colorOptions = "Color",
      copies = 1,
    } = req.body;

    // Find journal entry
    const journal = await Journal.findOne({ _id: id, userId: req.user._id });
    if (!journal) {
      return res.status(404).json({
        success: false,
        message: "Journal entry not found",
      });
    }

    // Update print settings
    journal.printSettings = {
      paperSize,
      printQuality,
      colorOptions,
      copies,
    };
    await journal.save();

    // Get template info if available
    let templateInfo = null;
    if (journal.templateId) {
      const template = await JournalTemplate.findById(journal.templateId);
      templateInfo = template
        ? {
            id: template._id,
            name: template.name,
            imageUrl: template.imageUrl,
          }
        : null;
    }

    // Generate print-ready data
    const printData = {
      journal: {
        id: journal._id,
        title: journal.title,
        content: journal.content,
        richContent: journal.richContent,
        mood: journal.mood,
        tags: journal.tags,
        createdAt: journal.createdAt,
        templateName: journal.templateName,
      },
      template: templateInfo,
      settings: {
        paperSize,
        printQuality,
        colorOptions,
        copies,
        printDate: new Date(),
        user: {
          name: req.user.name,
          email: req.user.email,
        },
      },
      metadata: {
        generatedAt: new Date(),
        appVersion: "1.0.0",
        pageCount: Math.ceil(
          (journal.richContent || journal.content || "").length / 2000
        ), // Rough estimate
      },
    };

    res.json({
      success: true,
      message: "Print data generated successfully",
      data: {
        printData,
        settings: journal.printSettings,
        downloadUrl: `/api/journals/${id}/print/download`, // Frontend can use this for PDF generation
      },
    });
  } catch (error) {
    console.error("Error generating print data:", error);
    res.status(500).json({
      success: false,
      message: "Error generating print data",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/journals/{id}/print/download:
 *   get:
 *     summary: "Download print-ready PDF (simplified version)"
 *     tags: [Journals]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF generated successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Access denied
 *       404:
 *         description: Journal not found
 *       500:
 *         description: Server error
 */
router.get("/:id/print/download", requireAuth, async function (req, res) {
  try {
    const { id } = req.params;
    const format = (req.query.format || "pdf").toLowerCase(); // pdf | html

    // Find journal entry
    const journal = await Journal.findOne({ _id: id, userId: req.user._id });
    if (!journal) {
      return res.status(404).json({
        success: false,
        message: "Journal entry not found",
      });
    }

    // Build background CSS/IMG if template has image
    let backgroundImageCss = "";
    let backgroundImageTag = "";
    try {
      if (journal.templateId) {
        const t = await JournalTemplate.findById(journal.templateId);
        if (t && t.imageUrl) {
          const baseUrl = `${req.protocol}://${req.get("host")}`;
          const normalized = String(t.imageUrl).replace(/\\\\/g, "/");
          const absoluteUrl = normalized.startsWith("http")
            ? normalized
            : `${baseUrl}/${normalized}`;
          backgroundImageCss = `
            .bg { position: fixed; inset: 0; z-index: 0; }
            .bg-img { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
          `;
          backgroundImageTag = `<img class=\"bg-img\" src=\"${absoluteUrl}\" alt=\"template background\"/>`;
        }
      }
    } catch (_) {}

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${journal.title || "Journal Entry"} - Everquill</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; line-height: 1.6; background: transparent; }
        .bg { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 0; }
        .page { position: relative; z-index: 1; max-width: 800px; margin: 0 auto; padding: 20px; background: rgba(255,255,255,0.85); }
        .header { text-align: center; border-bottom: 2px solid #E0BBE4; padding-bottom: 20px; margin-bottom: 30px; }
        .title { color: #6B46C1; font-size: 24px; margin-bottom: 10px; }
        .date { color: #666; font-size: 14px; }
        .content { margin-bottom: 30px; }
        .mood-tags { display: flex; gap: 20px; margin-bottom: 20px; }
        .mood, .tags { background: #F3F4F6; padding: 10px; border-radius: 5px; }
        .footer { text-align: center; color: #666; font-size: 12px; border-top: 1px solid #E0BBE4; padding-top: 20px; }
        @media print { body { margin: 0; } .header { page-break-after: avoid; } }
        ${backgroundImageCss}
    </style>
</head>
<body>
    ${backgroundImageCss ? '<div class="bg"></div>' : ""}
    ${backgroundImageTag}
    <div class=\"page\" style=\"max-width:720px;margin:32px auto;padding:32px;background:rgba(255,255,255,0.96);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.15);\">
    <div class=\"header\" style=\"text-align:center;border-bottom:2px solid #E0BBE4;padding-bottom:16px;margin-bottom:24px;\"> 
        <h1 class=\"title\" style=\"color:#6B46C1;font-size:26px;margin-bottom:8px;\">${
          journal.title || "Untitled Entry"
        }</h1>
        <div class=\"date\" style=\"color:#666;font-size:13px;\">${new Date(
          journal.createdAt
        ).toLocaleDateString()}</div>
    </div>
    <div class=\"mood-tags\" style=\"display:flex;gap:16px;margin-bottom:16px;\">
        ${
          journal.mood
            ? `<div class=\"mood\" style=\"background:#F3F4F6;padding:10px 12px;border-radius:8px;\"><strong>Mood:</strong> ${journal.mood}</div>`
            : ""
        }
        ${
          journal.tags && journal.tags.length > 0
            ? `<div class=\"tags\" style=\"background:#F3F4F6;padding:10px 12px;border-radius:8px;\"><strong>Tags:</strong> ${journal.tags.join(
                ", "
              )}</div>`
            : ""
        }
    </div>
    <div class=\"content\" style=\"margin-bottom:24px;\">${
      journal.richContent || journal.content || ""
    }</div>
    <div class=\"footer\" style=\"text-align:center;color:#666;font-size:12px;border-top:1px solid #E0BBE4;padding-top:16px;\">
        <p>Generated by Everquill - ${new Date().toLocaleDateString()}</p>
        <p>Template: ${journal.templateName}</p>
    </div>
    </div>
</body>
</html>`;

    if (format === "html") {
      res.setHeader("Content-Type", "text/html");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="journal-${journal._id}.html"`
      );
      return res.send(html);
    }

    // Skip PDF generation on Vercel (serverless environment)
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      console.log("[PRINT] Running in serverless environment, returning HTML");
      res.setHeader("Content-Type", "text/html");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="journal-${journal._id}.html"`
      );
      return res.send(html);
    }

    // Default: generate PDF via Puppeteer (fallback to HTML if module missing)
    let puppeteer;
    try {
      puppeteer = require("puppeteer");
    } catch (e) {
      // Fallback to HTML if puppeteer is not installed
      console.warn(
        "[PRINT] Puppeteer not available, falling back to HTML:",
        e.message
      );
      res.setHeader("Content-Type", "text/html");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="journal-${journal._id}.html"`
      );
      return res.send(html);
    }

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({ format: "A4", printBackground: true });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="journal-${journal._id}.pdf"`
      );
      res.setHeader("Content-Length", Buffer.byteLength(pdf));
      return res.end(pdf);
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("Error generating print download:", error);
    res.status(500).json({
      success: false,
      message: "Error generating print download",
      error: error.message,
    });
  }
});

// Get AI analysis history for a journal
router.get("/:id/analysis-history", requireAuth, async function (req, res) {
  try {
    const journalId = req.params.id;
    const userId = req.user._id;

    // Verify journal belongs to user
    const journal = await Journal.findOne({ _id: journalId, userId: userId });
    if (!journal) {
      return res.status(404).json({
        success: false,
        message: "Journal not found",
      });
    }

    // Get all AI analyses for this journal
    const analyses = await AIAnalysis.find({ journalId: journalId })
      .sort({ createdAt: -1 }) // Most recent first
      .select("results createdAt")
      .lean();

    res.json({
      success: true,
      analyses: analyses,
    });
  } catch (error) {
    console.error("Error fetching analysis history:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching analysis history",
      error: error.message,
    });
  }
});

// Save AI analysis history for a journal
router.post("/:id/analysis-history", requireAuth, async function (req, res) {
  try {
    const journalId = req.params.id;
    const userId = req.user._id;
    const analysisData = req.body;

    // Verify journal belongs to user
    const journal = await Journal.findOne({ _id: journalId, userId: userId });
    if (!journal) {
      return res.status(404).json({
        success: false,
        message: "Journal not found",
      });
    }

    // Save AI analysis with required fields
    const analysis = new AIAnalysis({
      journalId: journalId,
      userId: userId,
      analysisType: "emotion", // Default to emotion analysis
      content: journal.content || "Journal content", // Use journal content
      results: analysisData,
    });

    await analysis.save();

    res.json({
      success: true,
      message: "Analysis history saved successfully",
      analysis: analysis,
    });
  } catch (error) {
    console.error("Error saving analysis history:", error);
    res.status(500).json({
      success: false,
      message: "Error saving analysis history",
      error: error.message,
    });
  }
});

module.exports = router;
