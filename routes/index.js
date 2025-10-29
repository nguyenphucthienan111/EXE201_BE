var express = require("express");
var router = express.Router();

/* GET home page. */
router.get("/", function (req, res, next) {
  res.json({
    name: "EverQuill API",
    version: "1.0.0",
    status: "running",
    documentation: "/api/docs",
  });
});

// Redirect helper to Swagger UI
router.get("/docs", function (req, res) {
  res.redirect("/api/docs");
});

module.exports = router;
