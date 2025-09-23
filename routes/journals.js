var express = require("express");
var router = express.Router();
var Journal = require("../models/Journal");
var { requireAuth, requirePremium } = require("../middlewares/auth");

// Create
router.post("/", requireAuth, function (req, res) {
  var data = Object.assign({}, req.body, { userId: req.user._id });
  new Journal(data)
    .save()
    .then(function (doc) {
      res.status(201).json(doc);
    })
    .catch(function (err) {
      res.status(500).json({ message: err.message });
    });
});

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

// Premium content suggestions (placeholder)
/**
 * @openapi
 * /api/journals/suggest:
 *   post:
 *     summary: Gợi ý nội dung nhật ký cho user premium
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic:
 *                 type: string
 *               journalId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Danh sách gợi ý nội dung
 */
router.post("/suggest", requireAuth, requirePremium, async function (req, res) {
  var topic = req.body.topic || "reflection";
  var suggestions = [
    "Write about a recent challenge and what you learned.",
    "List three things you are grateful for today.",
    "Describe your current mood and the reason behind it.",
  ];
  // Nếu có journalId thì lưu suggestion vào journal
  if (req.body.journalId) {
    await Journal.findOneAndUpdate(
      { _id: req.body.journalId, userId: req.user._id },
      { suggestion: suggestions.join("\n") }
    );
  }
  res.json({ topic: topic, suggestions: suggestions });
});

// Premium sentiment analysis (placeholder)
/**
 * @openapi
 * /api/journals/analyze:
 *   post:
 *     summary: Phân tích cảm xúc nội dung nhật ký cho user premium
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               journalId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Kết quả phân tích cảm xúc
 */
router.post("/analyze", requireAuth, requirePremium, async function (req, res) {
  var content = req.body.content || "";
  var score = Math.max(0, Math.min(1, (content.length % 100) / 100));
  var label = score > 0.6 ? "positive" : score < 0.4 ? "negative" : "neutral";
  // Nếu có journalId thì lưu kết quả vào journal
  if (req.body.journalId) {
    await Journal.findOneAndUpdate(
      { _id: req.body.journalId, userId: req.user._id },
      { suggestion: `Sentiment: ${label} (${score})` }
    );
  }
  res.json({
    sentiment: score,
    label: label,
  });
});

/**
 * @openapi
 * /api/journals/sync/{id}:
 *   post:
 *     summary: Đánh dấu nhật ký đã đồng bộ cloud (premium only)
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

module.exports = router;
