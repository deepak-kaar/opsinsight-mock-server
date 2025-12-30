// Scheduler Administration/cronRegistry.js
import cron from "node-cron";
import { runEmailProcess } from "../../Email Administration/services/emailCron.js";

const cronRegistry = {};

export function startCron(jobId, cronExpression, jobType) {
  stopCron(jobId); // Stop existing instance if any

  if (!cron.validate(cronExpression)) {
    console.error("Invalid cron:", cronExpression);
    return;
  }

  let task;

  if (jobType === "EMAIL") {
    task = cron.schedule(cronExpression, async () => {
      console.log(`Executing EMAIL CRON: JobID=${jobId}, CRON=${cronExpression}`);
      await runEmailProcess();
    });
  }

  if (task) {
    cronRegistry[jobId] = task;
    console.log("Cron started for Job:", jobId);
  }
}

export function stopCron(jobId) {
  if (cronRegistry[jobId]) {
    cronRegistry[jobId].stop();
    delete cronRegistry[jobId];
    console.log("Cron stopped for Job:", jobId);
  }
}

export function stopAllCrons() {
  Object.keys(cronRegistry).forEach(id => stopCron(id));
}
