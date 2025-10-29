var passport = require("passport");

function requireAuth(req, res, next) {
  // Debug: log authorization header
  const authHeader = req.headers.authorization;
  console.log("[AUTH] Authorization header:", authHeader ? authHeader.substring(0, 50) + "..." : "missing");
  
  return passport.authenticate("jwt", { session: false }, function (err, user) {
    if (err) {
      console.log("[AUTH] Error:", err.message);
      return res.status(500).json({ message: "Auth error" });
    }
    if (!user) {
      console.log("[AUTH] No user found - token invalid or expired");
      return res.status(401).json({ message: "Unauthorized", detail: "Invalid or expired token" });
    }
    console.log("[AUTH] Success - User:", user.email);
    req.user = user;
    next();
  })(req, res, next);
}

function requirePremium(req, res, next) {
  if (req.user && req.user.plan === "premium") return next();
  return res.status(403).json({ message: "Premium plan required" });
}

module.exports = { requireAuth: requireAuth, requirePremium: requirePremium };
