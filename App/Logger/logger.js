// // logger.js
// import dgram from "dgram";
// import dotenv from "dotenv";
// import net from 'net';

// dotenv.config();

// const levels = {
//   INFO: "INFO",
//   WARN: "WARN",
//   ERROR: "ERROR",
// };

// const socket = dgram.createSocket("udp4");

// function log(message) {
//   return logWithLevel(levels.INFO, message);
// }

// function warn(message) {
//   return logWithLevel(levels.WARN, message);
// }

// function error(message, trace) {
//   const fullMessage = trace ? `${message} - Trace: ${trace}` : message;
//   return logWithLevel(levels.ERROR, fullMessage);
// }

// function logWithLevel(level, message) {
//   const timestamp = new Date().toISOString();
//   const cefMessage = createCEFMessage(level, message, timestamp);

//   console.log(cefMessage);

//   sendTCP(cefMessage);

//   return cefMessage; // so the route can use it
// }

// function createCEFMessage(level, msg, timestamp) {
//   const cefVersion = "0";
//   const deviceVendor = "Hydro Carbon CAD";
//   const deviceProduct = "Opsinsight";
//   const deviceVersion = "1.0";
//   const signatureID = "1001";
//   const severity = mapSeverity(level);

//   const extension = `${level}|${timestamp}|${msg}|Severity=${severity}`;

//   return `CEF:${cefVersion}|${deviceVendor}|${deviceProduct}|${deviceVersion}|${signatureID}|${msg}|${extension}`;
// }

// function mapSeverity(level) {
//   switch (level) {
//     case levels.INFO:
//       return 5;
//     case levels.WARN:
//       return 7;
//     case levels.ERROR:
//       return 10;
//     default:
//       return 6;
//   }
// }

// function sendTCP(message) {
//   const fn = "tcpTransport";
//   const messageTCP = Buffer.from(message);
//   const client = new net.Socket();
//   client.connect(process.env.SPLUNKPORT, process.env.SPLUNKIP, () => {
//     console.log("Connected to Splunk server");
//     client.write(messageTCP, (err) => {
//       if (err) {
//         console.log("Error while sending logs", err);
//       } else {
//         console.log("Logs sent successfully");
//       }
//       client.end();
//     });
//   });
//   client.on("error", (err) => {
//     console.log("Connection error", err);
//   });
// }

// export default { log, warn, error };

import dgram from "dgram";
import dotenv from "dotenv";
import net from "net";

dotenv.config();

const levels = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
};

const socket = dgram.createSocket("udp4");

function log(message, extra = {}) {
  return logWithLevel(levels.INFO, message, extra);
}

function warn(message, extra = {}) {
  return logWithLevel(levels.WARN, message, extra);
}

function error(message, trace, extra = {}) {
  const fullMessage = trace ? `${message} - Trace: ${trace}` : message;
  return logWithLevel(levels.ERROR, fullMessage, extra);
}

function getLocalISOTime() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  const local = new Date(now - offsetMs);           
  const iso = local.toISOString().slice(0, -1);     
  return iso;
}

function logWithLevel(level, message, extra = {}) {
  // const timestamp = new Date().toISOString();
  const timestamp = getLocalISOTime();
  const cefMessage = createCEFMessage(level, message, timestamp,extra);

  console.log(cefMessage);
  sendTCP(cefMessage);

  // JSON object for API response
  return {
    timestamp,
    level,
    service: extra.service || "default-service",
    message,
    userId: extra.userId || null,
    ip: extra.ip || null,
  };
}

function createCEFMessage(level, msg, timestamp, extra ={}) {
  const cefVersion = "0"; // CEF format version
  const deviceVendor = "CAD"; // Vendor name
  const deviceProduct = "OPSINSIGHT"; // Product name
  const deviceVersion = "1.0"; // Product version
  const signatureID = "1001"; // Unique identifier for the event
  const name = msg;
  const severity = mapSeverity(level);
  const ip = extra.ip; 

  // Extension fields for additional data
  let extension = `${level}|${timestamp}|${ip}`;

  console.log(msg);
  // CEF Format: CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
  return `CEF:${cefVersion}|${deviceVendor}|${deviceProduct}|${deviceVersion}|${signatureID}|${name}|${severity}|${extension}`;
}

function mapSeverity(level) {
  switch (level) {
    case levels.INFO:
      return 5;
    case levels.WARN:
      return 7;
    case levels.ERROR:
      return 10;
    default:
      return 6;
  }
}

function sendTCP(message) {
  const messageTCP = Buffer.from(message);
  const client = new net.Socket();
  client.connect(process.env.SPLUNKPORT, process.env.SPLUNKIP, () => {
    console.log("Connected to Splunk server");
    client.write(messageTCP, (err) => {
      if (err) {
        console.log("Error while sending logs", err);
      } else {
        console.log("Logs sent successfully");
      }
      client.end();
    });
  });
  client.on("error", (err) => {
    console.log("Connection error", err);
  });
}

export default { log, warn, error };
