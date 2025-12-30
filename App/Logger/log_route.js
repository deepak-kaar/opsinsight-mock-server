// import express from 'express';
// import logger from '../../logger.js';
// const router = express.Router();

// router.get('/getLog', (req, res) => {
//   const message = req.query.message || "Default log message";
//   const cef = logger.log(message);
//   res.send({ success: true, cef });
// });

// router.get('/getWarn', (req, res) => {
//   const message = req.query.message || "Default warning";
//   const cef = logger.warn(message);
//   res.send({ success: true, cef });
// });

// router.get('/getError', (req, res) => {
//   const message = req.query.message || "Default error";
//   const trace = req.query.trace || "no-trace";
//   const cef = logger.error(message, trace);
//   res.send({ success: true, cef });
// });

// export default router;







import express from "express";
import logger from "./logger.js";
const router = express.Router();

router.post("/postLog", (req, res) => {
  const message = req.body.message;
  // To Get client IP address
  const clientIP = req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    '127.0.0.1';
  const extra = {
    service: req.query.service || "user-auth",
    userId: req.query.userId || "12345",
    ip: clientIP,
  };
  const jsonLog = logger.log(message, extra);
  res.json(jsonLog);
});

router.get("/getWarn", (req, res) => {
  const message = req.query.message || "Default warning";
  const extra = {
    service: req.query.service || "user-auth",
    userId: req.query.userId || "12345",
    ip: req.query.ip || "192.168.1.10",
  };
  const jsonLog = logger.warn(message, extra);
  res.json(jsonLog);
});

router.get("/getError", (req, res) => {
  const message = req.query.message || "Default error";
  const trace = req.query.trace || "no-trace";
  const extra = {
    service: req.query.service || "user-auth",
    userId: req.query.userId || "12345",
    ip: req.query.ip || "192.168.1.10",
  };
  const jsonLog = logger.error(message, trace, extra);
  res.json(jsonLog);
});

export default router;
