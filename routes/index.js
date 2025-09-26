var express = require("express");
var router = express.Router();

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});

// Redirect helper to Swagger UI
router.get("/docs", function (req, res) {
  res.redirect("/api/docs");
});

module.exports = router;
