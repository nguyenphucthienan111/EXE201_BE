var dayjs = require("dayjs");
var Usage = require("../models/Usage");

function getToday() {
  return dayjs().format("YYYY-MM-DD");
}

function enforceJournalCreateLimit(req, res, next) {
  if (req.user && req.user.plan === "premium") return next();
  var today = getToday();
  Usage.findOne({ userId: req.user._id, date: today })
    .then(function (usage) {
      if (usage && usage.createdJournals >= 2) {
        return res
          .status(403)
          .json({
            message: "Free plan limit reached: max 2 journal entries per day",
          });
      }
      next();
    })
    .catch(function (err) {
      return res.status(500).json({ message: err.message });
    });
}

function trackJournalCreate(req, res, next) {
  var today = getToday();
  Usage.findOneAndUpdate(
    { userId: req.user._id, date: today },
    { $inc: { createdJournals: 1 } },
    { upsert: true, new: true }
  )
    .then(function () {
      next();
    })
    .catch(function (err) {
      return res.status(500).json({ message: err.message });
    });
}

function enforceBasicSuggestLimit(req, res, next) {
  if (req.user && req.user.plan === "premium") return next();
  var today = getToday();
  Usage.findOne({ userId: req.user._id, date: today })
    .then(function (usage) {
      if (usage && usage.basicSuggestionsUsed >= 3) {
        return res
          .status(403)
          .json({
            message: "Free plan limit reached: max 3 basic suggestions per day",
          });
      }
      next();
    })
    .catch(function (err) {
      return res.status(500).json({ message: err.message });
    });
}

function trackBasicSuggest(req, res, next) {
  var today = getToday();
  Usage.findOneAndUpdate(
    { userId: req.user._id, date: today },
    { $inc: { basicSuggestionsUsed: 1 } },
    { upsert: true, new: true }
  )
    .then(function () {
      next();
    })
    .catch(function (err) {
      return res.status(500).json({ message: err.message });
    });
}

module.exports = {
  enforceJournalCreateLimit: enforceJournalCreateLimit,
  trackJournalCreate: trackJournalCreate,
  enforceBasicSuggestLimit: enforceBasicSuggestLimit,
  trackBasicSuggest: trackBasicSuggest,
};
