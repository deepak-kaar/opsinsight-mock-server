// Scheduler Administration/cron/cronStartupLoader.js
import { connectToMongoDB } from "../../../config/connection.js";
import { startCron } from "./cronRegistry.js";

export async function loadCronsOnStartup() {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.SCHEDULERJOB_COLLECTION;

    const jobs = await db.collection(collectionName).find({
      inScheduled: true,
      cronExpression: "* * * * *"
    }).toArray();

    console.log(`Found ${jobs.length} email cron jobs to restore`);

    for (const job of jobs) {
      startCron(job.schedulerJobId, job.cronExpression, "EMAIL");
    }

  } catch (err) {
    console.error("Error loading startup crons:", err);
  }
}
