import { connectToMongoDB } from '../../../config/connection.js';
import LoggerService from '../../../services/logger.service.js';
import dotenv from 'dotenv';
import { ObjectId } from 'mongodb';
import { uploadAttachment } from './email_gridfs_service.js';

dotenv.config();

const post_email = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.EMAIL_COLLECTION;

        const {from, to, cc, bcc, emailSubject, emailBody, comments, createdBy, sendAfter, isActive, isGroup, isCorpRepo, 
               configId, groupName, groupDN, userCount, nestedGroupsCount, users, nestedGroups} = req.body;

        const newObjectId = new ObjectId();

        // Validation based on isGroup value
        if (!from || !emailSubject) {
            return res.status(400).json({
                token: '400',
                response: 'From and Email Subject are required fields'
            });
        }
        
        if (isGroup === 'true' || isGroup === true) {
            if (!configId || !groupName) {
                return res.status(400).json({
                    token: '400',
                    response: 'ConfigId and GroupName are required for group emails'
                });
            }
        } else {
            if (!to) {
                return res.status(400).json({
                    token: '400',
                    response: 'To field is required for regular emails'
                });
            }
        }

        // Handle attachments if any
        let attachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    const uploadResult = await uploadAttachment(
                        file.buffer,
                        file.originalname,
                        file.mimetype,
                        {
                            emailId: newObjectId.toHexString(),
                            uploadedBy: createdBy
                        }
                    );
                    attachments.push({
                        fileId: uploadResult.fileId.toString(),
                        filename: uploadResult.filename,
                        contentType: uploadResult.contentType,
                        size: uploadResult.size
                    });
                } catch (uploadError) {
                    console.error('Error uploading attachment:', uploadError);
                    // Continue with other files even if one fails
                }
            }
        }

        // Build email schema based on isGroup value
        const EmailSchema = {
            _id: newObjectId,
            emailId: newObjectId.toHexString(),
            from: from,
            cc: cc || null,
            bcc: bcc || null,
            emailSubject: emailSubject,
            emailBody: emailBody || null,
            attachments: attachments.length > 0 ? attachments : null,
            comments: comments || null,
            createdBy: createdBy,
            modifiedBy: null,
            createdAt: new Date(),
            modifiedAt: null,
            sendAfter: sendAfter ? new Date(sendAfter) : null,
            lastSent: null,
            isActive: isActive !== undefined ? isActive : true,
            isGroup: isGroup !== undefined ? isGroup : false,
            isCorpRepo: isCorpRepo !== undefined ? isCorpRepo : false
        };
        
        // Add fields based on email type
        if (isGroup === 'true' || isGroup === true) {
            // LDAP Group email fields
            EmailSchema.configId = configId;
            EmailSchema.groupName = groupName;
            EmailSchema.groupDN = groupDN || null;
            EmailSchema.userCount = userCount || 0;
            EmailSchema.nestedGroupsCount = nestedGroupsCount || 0;
            EmailSchema.users = users || [];
            EmailSchema.nestedGroups = nestedGroups || [];
            EmailSchema.to = null; // No direct 'to' field for group emails
        } else {
            // Regular email fields
            EmailSchema.to = to;
        }

        const result = await db.collection(collectionName).insertOne(EmailSchema);
        
        await LoggerService.logEvent({
            level: "info",
            category: "EMAIL_CREATE",
            action: "CREATE_EMAIL_SUCCESS",
            user: LoggerService.extractUserInfo(req),
            data: { emailId: EmailSchema.emailId, subject: emailSubject },
            performance: { responseTime: LoggerService.calculateResponseTime(startTime) }
        }, LoggerService.MODULES.EMAIL);
        
        return res.json({
            token: '200',
            Email: EmailSchema,
            attachmentsCount: attachments.length
        });
    } catch (err) {
        await LoggerService.logError({
            level: "error",
            category: "EMAIL_CREATE",
            action: "CREATE_EMAIL_FAILED",
            user: LoggerService.extractUserInfo(req),
            error: { message: err.message, stack: err.stack },
            performance: { responseTime: LoggerService.calculateResponseTime(startTime) }
        }, LoggerService.MODULES.EMAIL);
        
        return next(err);
    }
};

const get_email = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.EMAIL_COLLECTION;

        let filters = {};
        const appId = req.query.appId;

        if (appId) {
            filters.appId = appId;
        }

        const result = await db.collection(collectionName).find({...filters}).toArray();

        // Add attachment count to each email
        const emailsWithAttachmentInfo = result.map(email => ({
            ...email,
            attachmentCount: email.attachments ? email.attachments.length : 0
        }));

        await LoggerService.logEvent({
            level: "info",
            category: "EMAIL_FETCH",
            action: "GET_EMAILS_SUCCESS",
            user: LoggerService.extractUserInfo(req),
            result: { count: emailsWithAttachmentInfo.length },
            performance: { responseTime: LoggerService.calculateResponseTime(startTime) }
        }, LoggerService.MODULES.EMAIL);

        return res.json({
            token: '200',
            Email: emailsWithAttachmentInfo,
            count: emailsWithAttachmentInfo.length
        });
    } catch (err) {
        await LoggerService.logError({
            level: "error",
            category: "EMAIL_FETCH",
            action: "GET_EMAILS_FAILED",
            user: LoggerService.extractUserInfo(req),
            error: { message: err.message, stack: err.stack },
            performance: { responseTime: LoggerService.calculateResponseTime(startTime) }
        }, LoggerService.MODULES.EMAIL);
        
        return next(err);
    }
};

const get_email_by_id = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.EMAIL_COLLECTION;

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ token: '400', response: 'Invalid ID format' });
        }

        const result = await db.collection(collectionName).findOne({ emailId: id });

        if (!result) {
            return res.status(404).json({ token: '404', response: 'Email not found' });
        }

        // Add attachment count
        const emailWithAttachmentInfo = {
            ...result,
            attachmentCount: result.attachments ? result.attachments.length : 0
        };

        return res.json({
            token: '200',
            Email: emailWithAttachmentInfo
        });
    } catch (err) {
        return next(err);
    }
};

const update_email = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.EMAIL_COLLECTION;

        const id = req.params.id;
        const { from, to, cc, bcc, emailSubject, emailBody, comments, modifiedBy, sendAfter, lastSent, isActive, isGroup, 
               removeAttachments, configId, groupName, groupDN, userCount, nestedGroupsCount, users, nestedGroups } = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ token: '400', response: 'Invalid ID format' });
        }

        // Get existing email to manage attachments
        const existingEmail = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });

        if (!existingEmail) {
            return res.status(404).json({ token: '404', response: 'Email not found' });
        }

        // Handle attachment removal if requested
        let currentAttachments = existingEmail.attachments || [];

        if (removeAttachments) {
            try {
                const attachmentsToRemove = JSON.parse(removeAttachments);
                if (Array.isArray(attachmentsToRemove) && attachmentsToRemove.length > 0) {
                    // Delete from GridFS
                    const { deleteMultipleAttachments } = await import('./email_gridfs_service.js');
                    await deleteMultipleAttachments(attachmentsToRemove);

                    // Remove from attachments array
                    currentAttachments = currentAttachments.filter(
                        att => !attachmentsToRemove.includes(att.fileId)
                    );
                }
            } catch (parseError) {
                console.error('Error parsing removeAttachments:', parseError);
            }
        }

        // Handle new attachments if any
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    const uploadResult = await uploadAttachment(
                        file.buffer,
                        file.originalname,
                        file.mimetype,
                        {
                            emailId: existingEmail.emailId,
                            uploadedBy: modifiedBy || existingEmail.createdBy
                        }
                    );
                    currentAttachments.push({
                        fileId: uploadResult.fileId.toString(),
                        filename: uploadResult.filename,
                        contentType: uploadResult.contentType,
                        size: uploadResult.size
                    });
                } catch (uploadError) {
                    console.error('Error uploading new attachment:', uploadError);
                }
            }
        }

        const sendafter = new Date(sendAfter);

        const updateData = {
            ...(from && { from }),
            ...(cc !== undefined && { cc }),
            ...(bcc !== undefined && { bcc }),
            ...(emailSubject && { emailSubject }),
            ...(emailBody !== undefined && { emailBody }),
            ...(comments !== undefined && { comments }),
            ...(sendafter !== undefined && { sendAfter: sendafter }),
            ...(lastSent !== undefined && { lastSent }),
            ...(isActive !== undefined && { isActive }),
            ...(isGroup !== undefined && { isGroup }),
            attachments: currentAttachments.length > 0 ? currentAttachments : null,
            modifiedBy: modifiedBy,
            modifiedAt: new Date()
        };
        
        // Handle fields based on email type
        if (isGroup === 'true' || isGroup === true) {
            // LDAP Group email fields
            if (configId) updateData.configId = configId;
            if (groupName) updateData.groupName = groupName;
            if (groupDN !== undefined) updateData.groupDN = groupDN;
            if (userCount !== undefined) updateData.userCount = userCount;
            if (nestedGroupsCount !== undefined) updateData.nestedGroupsCount = nestedGroupsCount;
            if (users !== undefined) updateData.users = users;
            if (nestedGroups !== undefined) updateData.nestedGroups = nestedGroups;
            updateData.to = null; // Clear 'to' field for group emails
        } else {
            // Regular email - update 'to' field if provided
            if (to !== undefined) updateData.to = to;
        }

        const result = await db.collection(collectionName).updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ token: '404', response: 'Email not found' });
        }

        const updatedEmail = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });

        return res.json({
            token: '200',
            Email: {
                ...updatedEmail,
                attachmentCount: updatedEmail.attachments ? updatedEmail.attachments.length : 0
            },
            response: 'Email updated successfully'
        });
    } catch (err) {
        return next(err);
    }
};

const delete_email = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.EMAIL_COLLECTION;

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ token: '400', response: 'Invalid ID format' });
        }

        // Get email to check for attachments before deleting
        const email = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });

        if (!email) {
            return res.status(404).json({ token: '404', response: 'Email not found' });
        }

        // Delete attachments from GridFS if any
        if (email.attachments && email.attachments.length > 0) {
            const { deleteMultipleAttachments } = await import('./email_gridfs_service.js');
            const fileIds = email.attachments.map(att => att.fileId);
            await deleteMultipleAttachments(fileIds);
        }

        const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
            return res.json({ token: '200', id, response: 'Email and attachments deleted successfully' });
        } else {
            return res.status(404).json({ token: '404', response: 'Email not found' });
        }
    } catch (err) {
        return next(err);
    }
};

const get_attachment = async (req, res, next) => {
    try {
        const { fileId } = req.params;
        const { getAttachment, getAttachmentMetadata } = await import('./email_gridfs_service.js');

        // Get metadata first to set correct content type
        const metadata = await getAttachmentMetadata(fileId);
        const attachmentBuffer = await getAttachment(fileId);

        res.set('Content-Type', metadata.contentType);
        res.set('Content-Disposition', `attachment; filename="${metadata.filename}"`);
        res.send(attachmentBuffer);
    } catch (err) {
        if (err.message.includes('not found')) {
            return res.status(404).json({ token: '404', response: 'Attachment not found' });
        }
        return next(err);
    }
};

const get_all_attachments = async (req, res, next) => {
    try {
        const { getAllAttachments } = await import('./email_gridfs_service.js');
        const attachments = await getAllAttachments();

        return res.json({
            token: '200',
            attachments: attachments,
            count: attachments.length
        });
    } catch (err) {
        return next(err);
    }
};

const verify_attachment_chunks = async (req, res, next) => {
    try {
        const { fileId } = req.params;
        const { verifyAttachmentChunks } = await import('./email_gridfs_service.js');

        const verification = await verifyAttachmentChunks(fileId);

        return res.json({
            token: '200',
            verification: verification,
            chunksStored: verification.chunkCount > 0,
            chunksMatch: verification.chunkCount === verification.expectedChunks
        });
    } catch (err) {
        return next(err);
    }
};

export default {
    post_email,
    get_email,
    get_email_by_id,
    update_email,
    delete_email,
    get_attachment,
    get_all_attachments,
    verify_attachment_chunks
};