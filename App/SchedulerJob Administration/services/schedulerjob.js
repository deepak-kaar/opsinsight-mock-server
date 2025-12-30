import { connectToMongoDB } from '../../../config/connection.js';
import LoggerService from '../../../services/logger.service.js';
import dotenv from 'dotenv';
import { ObjectId } from 'mongodb';
import { startCron, stopCron } from "../cronJobs/cronRegistry.js";

dotenv.config();

const post_job = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.SCHEDULERJOB_COLLECTION;

        const { schedulerJobName, schedulerJob, jobDescription, cronExpression, triggerName, inScheduled } = req.body;

        if (!schedulerJobName || !cronExpression) {
            return res.status(400).json({ token: '400', response: 'Mandatory fields missing' });
        }

        const newObjectId = new ObjectId();

        const jobData = {
            _id: newObjectId,
            schedulerJobId: newObjectId.toHexString(),
            schedulerJobName,
            schedulerJob,
            jobDescription,
            cronExpression,
            triggerName,
            inScheduled,
            createdOn: new Date()
        };

        await db.collection(collectionName).insertOne(jobData);

        // const isEveryMinute =
        //     cronExpression === "* * * * *" ||
        //     cronExpression === "*/1 * * * *";

        // // START CRON ONLY IF EMAIL + every minute + scheduled
        // if (
        //     inScheduled === true &&
        //     isEveryMinute
        // ) {
        //     startCron(jobData.schedulerJobId, cronExpression, "EMAIL");
        // }

        return res.json({ token: "200", Config: jobData });

    } catch (err) {
        return next(err);
    }
};

const get_job = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.SCHEDULERJOB_COLLECTION;

        const result = await db.collection(collectionName).find({}).toArray();

        await LoggerService.logEvent({
            level: "info",
            category: "SCHEDULERJOB_FETCH",
            action: "GET_JOBS_SUCCESS",
            user: LoggerService.extractUserInfo(req),
            result: { count: result.length },
            performance: { responseTime: LoggerService.calculateResponseTime(startTime) }
        }, LoggerService.MODULES.SCHEDULERJOB);

        return res.json({ token: '200', Jobs: result });
    } catch (err) {
        await LoggerService.logError({
            level: "error",
            category: "SCHEDULERJOB_FETCH",
            action: "GET_JOBS_FAILED",
            user: LoggerService.extractUserInfo(req),
            error: { message: err.message, stack: err.stack },
            performance: { responseTime: LoggerService.calculateResponseTime(startTime) }
        }, LoggerService.MODULES.SCHEDULERJOB);

        return next(err);
    }
};

const get_job_by_id = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.SCHEDULERJOB_COLLECTION;

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ token: '400', response: 'Invalid ID format' });
        }

        const result = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });

        if (!result) {
            return res.status(404).json({ token: '404', response: 'Job not found' });
        }

        return res.json({ token: '200', Config: result });
    } catch (err) {
        return next(err);
    }
};

const update_job = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.SCHEDULERJOB_COLLECTION;

        const id = req.params.id;

        //const oldJob = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });

        const { schedulerJobName, schedulerJob, jobDescription, cronExpression, triggerName, inScheduled } = req.body;

        const updateData = {
            schedulerJobName,
            schedulerJob,
            jobDescription,
            cronExpression,
            triggerName,
            inScheduled,
            modifiedOn: new Date()
        };

        await db.collection(collectionName).updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        const updatedJob = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });

        // const isEveryMinute =
        //     updatedJob.cronExpression === "* * * * *" ||
        //     updatedJob.cronExpression === "*/1 * * * *";

        // // 1️⃣ If scheduling turned off → STOP CRON
        // if (!updatedJob.inScheduled) {
        //     stopCron(updatedJob.schedulerJobId);
        // }

        
        // // 2️⃣ If cron changed to not every minute → STOP
        // else if (oldJob.cronExpression !== updatedJob.cronExpression &&
        //     isEveryMinute) {
        //     stopCron(updatedJob.schedulerJobId);
        // }
        // // 3️⃣ If cron changed to every minute AND job is email → START
        // else if (
        //     updatedJob.inScheduled &&
        //     isEveryMinute
        // ) {
        //     startCron(updatedJob.schedulerJobId, updatedJob.cronExpression, "EMAIL");
        // }

        return res.json({ token: "200", Job: updatedJob });

    } catch (err) {
        return next(err);
    }
};


const delete_job = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.SCHEDULERJOB_COLLECTION;

        const id = req.params.id;

        const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
            //stopCron(id);  // IMPORTANT
            return res.json({ token: "200", response: "Job deleted" });
        }

        return res.status(404).json({ token: '404', response: 'Job not found' });

    } catch (err) {
        return next(err);
    }
};
export default { post_job, get_job, get_job_by_id, update_job, delete_job };