import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectToMongoDB } from "./config/connection.js";
import { Server } from "socket.io";
import http from 'http';
import registerVideoStreamingSockets from "./App/Video Streaming/sockets/videoStreaming.socket.js";

import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";

import "./App/AccountEnabler/cronJobs/accountEnablerScheduler.js";
import { loadCronsOnStartup } from "./App/SchedulerJob Administration/cronJobs/cronStartUpLoader.js";
import { startEmailCron } from "./App/Email Administration/services/emailCron.js";

// Datapoint Administration Routes
import report_route from "./App/Datapoint Administration/Report/report_route.js";
import entity_route from "./App/Datapoint Administration/Entity/entity_route.js";
import flag_route from "./App/Datapoint Administration/Flag/flag_route.js";
import event_route from "./App/Datapoint Administration/Event/event_route.js";
import datapoint_route from "./App/Datapoint Administration/Datapoint/datapoint_route.js";
import idt_route from "./App/Datapoint Administration/IDT/idt_route.js";
import instance_route from "./App/Datapoint Administration/Instance/instance_route.js";
import template_route from "./App/Datapoint Administration/Template/template_route.js";
import sensor_route from "./App/Datapoint Administration/Sensor/sensor_route.js";
import entity_data_route from "./App/Datapoint Administration/Entity Data/entity_data_route.js";
import attribute_route from "./App/Datapoint Administration/Attributes/attribute_route.js";

// Organization Administration Routes
import organization_route from "./App/Organization Administration/Organization/organization_route.js";
import roles_route from "./App/Organization Administration/Roles/roles_route.js";
import users_route from "./App/Organization Administration/Users/users_route.js";
import shift_route from "./App/Organization Administration/Shifts/shift_route.js";
import group_route from "./App/Organization Administration/Groups/group_route.js";
import app_route from "./App/Organization Administration/Apps/app_route.js";

// Calculation Engine Routes
import calculation_route from "./App/CalculationEngine/routes/calculation_route.js";

// Correlation Engine Routes
import correlation_route from "./App/CorrelationEngine/routes/correlation_route.js";

// PI Administration Routes
import pi_route from "./App/PI Administration/routes/pi_route.js";

// DataSource Administration Routes
import datasource_route from "./App/DataSource Administration/routes/datasource_route.js";

// Database Administration Routes
import database_route from "./App/Database Administration/routes/database_route.js";

// Generate PDF Reports
import pdfReport_route from "./App/PDFReports/routes/PDFReport_route.js";

// Authorization
import auth_route from "./App/Auth/auth_route.js";

// Notifications
import notif_route from "./App/Datapoint Administration/Notifications/notifications_route.js";

// Logger
import log_route from "./App/Logger/log_route.js";
import logging_overview from "./App/Logger/logging_overview_route.js";
import db_health_route from "./App/Logger/db_health_route.js";
import database_metrics from "./App/Logger/database_metrics_route.js";

// Activity Engine Routes
import activity_route from "./App/ActivityEngine/routes/activityEngine_route.js";

// Config Administration Routes
import config_route from "./App/Config Administration/config_route.js";

// Test Routes (GridFS Image Upload/Retrieval)
import test_route from "./App/Test/test_route.js";

// Proxy
import proxy_route from "./config/proxy.js";

// Live Streaming
import liveStreaming_route from "./App/Live Streaming/routes/livestreaming_route.js";

// SchedulerJob Administration Routes
import schedulerjob_route from "./App/SchedulerJob Administration/routes/schedulerjob_route.js";

// Email Administration Routes
import email_route from "./App/Email Administration/routes/email_route.js"

// Report Image Administration Routes
import report_image from "./App/Report Image Administration/routes/report_image_route.js"

// Tag Search Routes
import tag_search from "./App/Tag Search/routes/tagsearch_route.js";

// Tag Search Logging Routes
import tag_search_logging from "./App/Tag Search/routes/tagsearch_logging_route.js";

// Attribute Search Logging Routes
import attribute_search_logging from "./App/Datapoint Administration/Attributes/attribute_logging_route.js";

// Datapoint Logging Routes
import datapoint_logging from "./App/Datapoint Administration/routes/datapoint_logging_route.js";

// SchedulerJob Logging Routes
import schedulerjob_logging from "./App/SchedulerJob Administration/routes/schedulerjob_logging_route.js";

// Email Logging Routes
import email_logging from "./App/Email Administration/routes/email_logging_route.js";

// Report Image Logging Routes
import reportimage_logging from "./App/Report Image Administration/routes/reportimage_logging_route.js";

// Config Logging Routes
import config_logging from "./App/Config Administration/routes/config_logging_route.js";

// PI Admin Logging Routes
import pi_logging from "./App/PI Administration/routes/pi_logging_route.js";

// Database Admin Logging Routes
import database_logging from "./App/Database Administration/routes/database_logging_route.js";

// DataSource Admin Logging Routes
import datasource_logging from "./App/DataSource Administration/routes/datasource_logging_route.js";

// Mongo Administration Routes
import mongoadmin_route from "./App/Mongo Administration/routes/mongoadmin_route.js";

// Document Scanning Routes
import documentScanning_route from './App/Document Scanning/routes/documentScanning_route.js';

// Video Streaming Routes
import videoStreaming_route from './App/Video Streaming/routes/videoStreaming_route.js';

// WebService Routes
import webService_route from "./App/Webservice Administration/routes/webServiceAdmin_route.js";

import accountEnabler_route from "./App/AccountEnabler/routes/accEnabler_route.js";
import LoggerService from "./services/logger.service.js";

import storeAggregate from "./services/test_aggregate.js";


// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;


// Enable CORS for all routes
app.use(cors());


app.use((req, res, next) => {
  req.correlationId = LoggerService.generateCorrelationId();
  next();
});


app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).json({});
  }

  next();
});


// Middleware to parse JSON and text bodies
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(express.text({ type: "text/html", limit: "50mb" }));

const startApp = async () => {
  try {
    await connectToMongoDB();
    console.log("MongoDB Connected Successfully");
    registerVideoStreamingSockets(io);
    //loadCronsOnStartup();
    startEmailCron();
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  }
};

// Swagger definition
const swaggerOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "My API",
      version: "1.0.0",
      description: "API documentation using Swagger",
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./server.js", "./routes/**/*.js", "./App/**/*.js"],
};

const swaggerDocs = swaggerJSDoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));



app.use("/report", report_route);
app.use("/entity", entity_route);
app.use("/flag", flag_route);
app.use("/datapoint", datapoint_route);
app.use("/event", event_route);
app.use("/idt", idt_route);
app.use("/instance", instance_route);
app.use("/template", template_route);
app.use("/sensor", sensor_route);
app.use("/entityData", entity_data_route);
app.use("/attribute", attribute_route);
app.use("/notification", notif_route);

app.use("/organization", organization_route);
app.use("/roles", roles_route);
app.use("/users", users_route);
app.use("/shift", shift_route);
app.use("/group", group_route);
app.use("/app", app_route);

app.use("/auth", auth_route);
app.use("/pdf", pdfReport_route);

// PI Administration Routes
app.use("/pi", pi_route);

// DataSource Administration Routes
app.use("/datasource", datasource_route);

// Database Administration Routes
app.use("/database", database_route);

// Calculation Routes
app.use("/calc", calculation_route);

// Correlation Routes
app.use("/correlation", correlation_route);

// Activity Routes
app.use("/activity", activity_route);

// Config Routes
app.use("/config", config_route);

// Test Routes
app.use("/test", test_route);

// Serve test HTML page
app.get("/test-page", (req, res) => {
  res.sendFile("App/Test/test.html", { root: "." });
});

// account enabler routes
app.use("/accountEnabler", accountEnabler_route);

// Logger Routes
app.use("/logger", log_route);

// Logging Overview Routes
app.use("/loggingOverview", logging_overview);

// DB Health / Audit / SSE Routes
app.use("/logger", db_health_route);

// Database Metrics Routes (DB health, pool, CPU, analysis)
app.use("/logger", database_metrics);

// Proxy Routes
app.use("/proxy", proxy_route);

// Live Streaming Routes
app.use("/liveStreaming", liveStreaming_route);

// SchedulerJob Routes
app.use("/schedulerjob", schedulerjob_route);

// Email Routes
app.use("/email", email_route);


// aggreagate test
app.post("/test_aggregate", storeAggregate);

// Report Image Routes
app.use("/report_image", report_image);

// Tag Search Routes
app.use("/tagSearch", tag_search);

// Tag Utilization Logging Routes
app.use("/tagUtilization", tag_search_logging);

// Attribute Search Logging Routes
app.use("/attributeSearch", attribute_search_logging);

// Datapoint Logging Routes
app.use("/dataPoint", datapoint_logging);

// SchedulerJob Logging Routes
app.use("/schedulerJob", schedulerjob_logging);

// Email Logging Routes
app.use("/emailAdmin", email_logging);

// Report Image Logging Routes
app.use("/reportImageAdmin", reportimage_logging);

// Config Logging Routes
app.use("/configAdmin", config_logging);

// PI Admin Logging Routes
app.use("/piAdmin", pi_logging);

// Database Admin Logging Routes
app.use("/databaseAdmin", database_logging);

// DataSource Admin Logging Routes
app.use("/datasourceAdmin", datasource_logging);

// Mongo Administration Routes
app.use("/mongoAdmin", mongoadmin_route);

// Document Scanning Routes
app.use("/scanning", documentScanning_route);

// Video Streaming Routes
app.use("/vs", videoStreaming_route);

// WebService Routes
app.use("/webService", webService_route);



const server = http.createServer(app);
// Allow all origins (for local testing)
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8 // 100 MB for large video chunks
});

startApp();