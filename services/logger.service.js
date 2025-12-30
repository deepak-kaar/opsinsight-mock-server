// services/logger.service.js

import { ObjectId } from "mongodb";
import os from "os";
import crypto from "crypto";
import { connectToMongoDB } from "../config/connection.js";


class LoggerService {
  constructor() {
    this.LOG_COLLECTION = "ApplicationLogs";
    this.AUDIT_COLLECTION = "AuditTrail";
    this.PERFORMANCE_COLLECTION = "PerformanceMetrics";
    this.SECURITY_COLLECTION = "SecurityEvents";
    this.ERROR_COLLECTION = "ErrorLogs";
    
    // Module constants
    this.MODULES = {
      MONGODB_ADMIN: "MongoDB Administration",
      ATTRIBUTE_SEARCH: "Attribute Search", 
      TAG_SEARCH: "Tag Utilization",
      DATAPOINT: "Datapoint Administration",
      SCHEDULERJOB: "SchedulerJob Administration",
      EMAIL: "Email Administration",
      REPORT_IMAGE: "ReportImage Administration",
      CONFIG: "Config Administration",
      PI_ADMIN: "PI Administration",
      DATABASE_ADMIN: "Database Administration",
      DATASOURCE_ADMIN: "DataSource Administration"
    };
  }

  /**
   * Generate unique correlation ID for request tracking
   */
  generateCorrelationId() {
    return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  }

  /**
   * Get system metrics
   */
  getSystemMetrics() {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      cpuUsage: process.cpuUsage(),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      loadAverage: os.loadavg(),
      freeMemory: os.freemem(),
      totalMemory: os.totalmem(),
    };
  }

  /**
   * Extract user information from request
   */
  extractUserInfo(req) {
    return {
      userId: req.user?.id || req.headers["x-user-id"] || "anonymous",
      username: req.user?.username || req.headers["x-username"] || "anonymous",
      email: req.user?.email || req.headers["x-user-email"] || null,
      roles: req.user?.roles || req.headers["x-user-roles"]?.split(",") || [],
      sessionId: req.sessionID || req.headers["x-session-id"] || null,
      ipAddress: req.ip || req.connection.remoteAddress || req.headers["x-forwarded-for"],
      userAgent: req.headers["user-agent"],
    };
  }

  /**
   * Extract request metadata
   */
  extractRequestMetadata(req) {
    return {
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      headers: this.sanitizeHeaders(req.headers),
      protocol: req.protocol,
      secure: req.secure,
      host: req.hostname,
      baseUrl: req.baseUrl,
    };
  }

  /**
   * Sanitize sensitive headers
   */
  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveKeys = ["authorization", "cookie", "x-api-key", "x-auth-token"];
    
    sensitiveKeys.forEach(key => {
      if (sanitized[key]) {
        sanitized[key] = "[REDACTED]";
      }
    });
    
    return sanitized;
  }

  /**
   * Sanitize sensitive data from payload
   */
  sanitizePayload(data) {
    if (!data || typeof data !== "object") return data;
    
    const sanitized = JSON.parse(JSON.stringify(data));
    const sensitiveFields = ["password", "token", "secret", "apiKey", "creditCard", "ssn"];
    
    const redact = (obj) => {
      for (let key in obj) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          obj[key] = "[REDACTED]";
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          redact(obj[key]);
        }
      }
    };
    
    redact(sanitized);
    return sanitized;
  }

  /**
   * Log application event
   */
  async logEvent(eventData, module = "General") {
    try {
      const db = await connectToMongoDB();
      const collection = db.collection(this.LOG_COLLECTION);

      const logEntry = {
        _id: new ObjectId(),
        timestamp: new Date(),
        eventId: this.generateCorrelationId(),
        module: module,
        collection: eventData.category || null,
        ...eventData,
        systemMetrics: this.getSystemMetrics(),
        environment: process.env.NODE_ENV || "development",
      };

      await collection.insertOne(logEntry);
      return logEntry.eventId;
    } catch (error) {
      console.error("Failed to log event:", error);
      // Fallback to console logging
      console.log("[LOG EVENT]", JSON.stringify(eventData, null, 2));
    }
  }

  /**
   * Log audit trail (for data modifications)
   */
  async logAudit(auditData, module = "General") {
    try {
      const db = await connectToMongoDB();
      const collection = db.collection(this.AUDIT_COLLECTION);

      const auditEntry = {
        _id: new ObjectId(),
        timestamp: new Date(),
        auditId: this.generateCorrelationId(),
        module: module,
        ...auditData,
        checksumBefore: auditData.dataBefore ? this.generateChecksum(auditData.dataBefore) : null,
        checksumAfter: auditData.dataAfter ? this.generateChecksum(auditData.dataAfter) : null,
      };

      await collection.insertOne(auditEntry);
      return auditEntry.auditId;
    } catch (error) {
      console.error("Failed to log audit:", error);
    }
  }

  /**
   * Log performance metrics
   */
  async logPerformance(performanceData, module = "General") {
    try {
      const db = await connectToMongoDB();
      const collection = db.collection(this.PERFORMANCE_COLLECTION);

      const perfEntry = {
        _id: new ObjectId(),
        timestamp: new Date(),
        module: module,
        ...performanceData,
      };

      await collection.insertOne(perfEntry);
    } catch (error) {
      console.error("Failed to log performance:", error);
    }
  }

  /**
   * Log security event
   */
  async logSecurity(securityData, module = "General") {
    try {
      const db = await connectToMongoDB();
      const collection = db.collection(this.SECURITY_COLLECTION);

      const securityEntry = {
        _id: new ObjectId(),
        timestamp: new Date(),
        securityId: this.generateCorrelationId(),
        module: module,
        severity: securityData.severity || "medium",
        ...securityData,
        systemInfo: this.getSystemMetrics(),
      };

      await collection.insertOne(securityEntry);

      // Alert on high severity events
      if (securityData.severity === "high" || securityData.severity === "critical") {
        console.error("[SECURITY ALERT]", JSON.stringify(securityEntry, null, 2));
        // TODO: Integrate with SIEM/IDS
      }

      return securityEntry.securityId;
    } catch (error) {
      console.error("Failed to log security event:", error);
    }
  }

  /**
   * Log error
   */
  async logError(errorData, module = "General") {
    try {
      const db = await connectToMongoDB();
      const collection = db.collection(this.ERROR_COLLECTION);

      const errorEntry = {
        _id: new ObjectId(),
        timestamp: new Date(),
        errorId: this.generateCorrelationId(),
        module: module,
        ...errorData,
        stack: errorData.error?.stack,
        systemMetrics: this.getSystemMetrics(),
      };

      await collection.insertOne(errorEntry);
      return errorEntry.errorId;
    } catch (error) {
      console.error("Failed to log error:", error);
    }
  }

  /**
   * Generate checksum for data integrity
   */
  generateChecksum(data) {
    const jsonString = JSON.stringify(data);
    return crypto.createHash("sha256").update(jsonString).digest("hex");
  }

  /**
   * Calculate response time
   */
  calculateResponseTime(startTime) {
    const endTime = process.hrtime(startTime);
    return (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2); // milliseconds
  }
}

export default new LoggerService();
