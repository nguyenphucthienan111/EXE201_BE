var dotenv = require("dotenv");
dotenv.config();

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
console.log("[DEBUG] SMTP_HOST:", process.env.SMTP_HOST);
console.log("[DEBUG] SMTP_USER:", process.env.SMTP_USER);
console.log(
  "[DEBUG] SMTP_PASS:",
  process.env.SMTP_PASS ? "******" : "undefined"
);
var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Mongo connection
var mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/everquill";
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

// Swagger setup
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

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/api/auth", authRouter);
app.use("/api/journals", journalRouter);
app.use("/api/moods", moodRouter);
app.use("/api/plans", planRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/admin", adminRouter);
app.use("/api/templates", templateRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
