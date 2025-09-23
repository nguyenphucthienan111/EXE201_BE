var passport = require("passport");

function requireAuth(req, res, next) {
  return passport.authenticate("jwt", { session: false }, function (err, user) {
    if (err) return res.status(500).json({ message: "Auth error" });
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    req.user = user;
    next();
  })(req, res, next);
}

function requirePremium(req, res, next) {
  if (req.user && req.user.plan === "premium") return next();
  return res.status(403).json({ message: "Premium plan required" });
}

module.exports = { requireAuth: requireAuth, requirePremium: requirePremium };
