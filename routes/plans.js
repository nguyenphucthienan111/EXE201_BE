var express = require("express");
var router = express.Router();
var { requireAuth } = require("../middlewares/auth");
var User = require("../models/User");

// Upgrade/downgrade plan (mock, integrate payment later)
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

router.get("/me", requireAuth, function (req, res) {
  res.json({ plan: req.user.plan });
});

module.exports = router;
