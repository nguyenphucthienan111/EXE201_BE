var passport = require("passport");
var JwtStrategy = require("passport-jwt").Strategy;
var ExtractJwt = require("passport-jwt").ExtractJwt;
var GoogleStrategy = require("passport-google-oauth20").Strategy;
var User = require("../models/User");

var jwtOpts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || "secret",
};

passport.use(
  new JwtStrategy(jwtOpts, function (payload, done) {
    User.findById(payload.sub)
      .then(function (user) {
        if (!user) return done(null, false);
        return done(null, user);
      })
      .catch(function (err) {
        return done(err, false);
      });
  })
);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
    },
    function (accessToken, refreshToken, profile, done) {
      User.findOne({ googleId: profile.id })
        .then(function (existing) {
          if (existing) return done(null, existing);
          var email =
            Array.isArray(profile.emails) && profile.emails.length
              ? profile.emails[0].value
              : undefined;
          var newUser = new User({
            email: email,
            googleId: profile.id,
            name: profile.displayName,
            isEmailVerified: true,
            plan: "free",
          });
          return newUser.save();
        })
        .then(function (user) {
          return done(null, user);
        })
        .catch(function (err) {
          return done(err, false);
        });
    }
  )
);

module.exports = passport;
