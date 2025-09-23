var express = require("express");
var router = express.Router();
var Mood = require("../models/Mood");
var { requireAuth } = require("../middlewares/auth");
var dayjs = require("dayjs");

router.post("/", requireAuth, function (req, res) {
  var date = req.body.date || dayjs().format("YYYY-MM-DD");
  var payload = {
    userId: req.user._id,
    date: date,
    mood: req.body.mood,
    score: req.body.score,
    notes: req.body.notes,
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

module.exports = router;
