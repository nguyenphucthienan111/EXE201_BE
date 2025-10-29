var dotenv = require("dotenv");
// Only load .env in development
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

// Check required environment variables
const requiredEnvVars = ["MONGO_URI", "JWT_SECRET"];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error("Missing required environment variables:", missingVars);
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");
var mongoose = require("mongoose");
var passport = require("passport");
var swaggerUi = require("swagger-ui-express");
var swaggerJsdoc = require("swagger-jsdoc");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var authRouter = require("./routes/auth");
var journalRouter = require("./routes/journals");
var moodRouter = require("./routes/moods");
var planRouter = require("./routes/plans");
var paymentRouter = require("./routes/payments");
var notificationRouter = require("./routes/notifications");
var adminRouter = require("./routes/admin");
var templateRouter = require("./routes/templates");
var reviewRouter = require("./routes/reviews");
var contactRouter = require("./routes/contact");
console.log("[DEBUG] SMTP_HOST:", process.env.SMTP_HOST);
console.log("[DEBUG] SMTP_USER:", process.env.SMTP_USER);
console.log(
  "[DEBUG] SMTP_PASS:",
  process.env.SMTP_PASS ? "******" : "undefined"
);
var app = express();

// No view engine needed (API only)

app.use(logger("dev"));
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
// Static uploads - kept for backward compatibility with old avatars
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Mongo connection
var mongoUri = process.env.MONGO_URI;
mongoose
  .connect(mongoUri)
  .then(function () {
    console.log("Mongo connected");

    // Initialize notification scheduler after DB connection
    const {
      initNotificationScheduler,
    } = require("./utils/notificationScheduler");
    initNotificationScheduler();
  })
  .catch(function (err) {
    console.error("Mongo error", err.message);
  });

// Passport strategies
require("./config/passport");
app.use(passport.initialize());

// Swagger setup - only in development
if (process.env.NODE_ENV !== "production") {
  var swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: "3.0.0",
      info: { title: "Everquill API", version: "1.0.0" },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      security: [{ bearerAuth: [] }],
      servers: [{ url: "http://localhost:" + (process.env.PORT || 3000) }],
    },
    apis: ["./routes/*.js", "./models/*.js"],
  });
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} else {
  // Production: return simple JSON for /api/docs
  app.get("/api/docs", function (req, res) {
    res.json({
      message: "API Documentation is available in development mode only",
      endpoints: {
        auth: "/api/auth",
        users: "/api/users",
        journals: "/api/journals",
        moods: "/api/moods",
        templates: "/api/templates",
        reviews: "/api/reviews",
        payments: "/api/payments",
        notifications: "/api/notifications",
        admin: "/api/admin",
        contact: "/api/contact",
      },
    });
  });
}

app.use("/", indexRouter);
app.use("/api/users", usersRouter);
app.use("/api/auth", authRouter);
app.use("/api/journals", journalRouter);
app.use("/api/moods", moodRouter);
app.use("/api/plans", planRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/admin", adminRouter);
app.use("/api/templates", templateRouter);
app.use("/api/reviews", reviewRouter);
app.use("/api/contact", contactRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // Log error for debugging
  console.error("Error:", err);

  // Return JSON error for API endpoints
  if (req.path.startsWith("/api/")) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? err : undefined,
    });
  }

  // Return JSON error (API mode)
  res.status(err.status || 500);
  res.json({
    error: {
      message: err.message,
      status: err.status || 500,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    },
  });
});

module.exports = app;
