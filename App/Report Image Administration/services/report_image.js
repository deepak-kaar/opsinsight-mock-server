import { connectToMongoDB } from '../../../config/connection.js';
import LoggerService from '../../../services/logger.service.js';
import dotenv from 'dotenv';
import { ObjectId } from 'mongodb';
import { uploadReportImage } from './report_image_gridfs_service.js';

dotenv.config();

const post_reportImage = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.REPORT_IMAGE_COLLECTION;

        const { appId, appName, orgId, orgName, name, createdBy } = req.body;

        const newObjectId = new ObjectId();

        if (!appId || !orgId) {
            return res.status(400).json({
                token: '400',
                response: 'appId and orgId are required fields'
            });
        }

        if(!name){
             return res.status(400).json({
                token: '400',
                response: 'Name is required fields'
            });
        }

        // Handle file upload if provided
        let fileData = null;
        if (req.file) {
            try {
                const uploadResult = await uploadReportImage(
                    req.file.buffer,
                    req.file.originalname,
                    req.file.mimetype,
                    {
                        reportImageId: newObjectId.toHexString(),
                        appId: appId,
                        orgId: orgId,
                        uploadedBy: createdBy
                    }
                );
                fileData = {
                    fileId: uploadResult.fileId.toString(),
                    filename: uploadResult.filename,
                    contentType: uploadResult.contentType,
                    size: uploadResult.size
                };
            } catch (uploadError) {
                console.error('Error uploading file:', uploadError);
                return res.status(500).json({
                    token: '500',
                    response: 'Error uploading file'
                });
            }
        }

        const ReportImageSchema = {
            _id: newObjectId,
            reportImageId: newObjectId.toHexString(),
            appId: appId,
            appName: appName || null,
            orgId: orgId,
            orgName: orgName || null,
            fileName: fileData,
            name: name,
            createdBy: createdBy || null,
            createdOn: new Date()
        };

        const result = await db.collection(collectionName).insertOne(ReportImageSchema);
        
        await LoggerService.logEvent({
            level: "info",
            category: "REPORT_IMAGE_CREATE",
            action: "CREATE_REPORT_IMAGE_SUCCESS",
            user: LoggerService.extractUserInfo(req),
            data: { reportImageId: ReportImageSchema.reportImageId, name },
            performance: { responseTime: LoggerService.calculateResponseTime(process.hrtime()) }
        }, LoggerService.MODULES.REPORT_IMAGE);
        
        return res.json({
            token: '200',
            ReportImage: ReportImageSchema,
            message: 'Report image created successfully'
        });
    } catch (err) {
        await LoggerService.logError({
            level: "error",
            category: "REPORT_IMAGE_CREATE",
            action: "CREATE_REPORT_IMAGE_FAILED",
            user: LoggerService.extractUserInfo(req),
            error: { message: err.message, stack: err.stack }
        }, LoggerService.MODULES.REPORT_IMAGE);
        
        return next(err);
    }
};

const get_reportImage = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.REPORT_IMAGE_COLLECTION;

        let filters = {};
        const { appId, orgId } = req.query;

        if (appId) {
            filters.appId = appId;
        }
        if (orgId) {
            filters.orgId = orgId;
        }

        const result = await db.collection(collectionName).find({...filters}).toArray();

        // Add file info to each report image
        const reportImagesWithFileInfo = result.map(img => ({
            ...img,
            hasFile: img.fileName ? true : false,
            fileSize: img.fileName ? img.fileName.size : null
        }));

        await LoggerService.logEvent({
            action: "FETCH_REPORT_IMAGE_RECORDS",
            resourceType: "REPORT_IMAGE",
            userInfo: LoggerService.extractUserInfo(req),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            resultCount: result.length,
            filters: filters,
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);

        return res.json({
            token: '200',
            ReportImage: reportImagesWithFileInfo,
            count: reportImagesWithFileInfo.length
        });
    } catch (err) {
        await LoggerService.logError({
            action: "FETCH_REPORT_IMAGE_RECORDS",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);
        return next(err);
    }
};

const get_reportImage_by_id = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.REPORT_IMAGE_COLLECTION;

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            await LoggerService.logError({
                action: "FETCH_REPORT_IMAGE_BY_ID",
                error: new Error("Invalid ID format"),
                userInfo: LoggerService.extractUserInfo(req),
                requestData: { id },
                responseTime: LoggerService.calculateResponseTime(startTime)
            }, LoggerService.MODULES.REPORT_IMAGE);
            return res.status(400).json({ token: '400', response: 'Invalid ID format' });
        }

        const result = await db.collection(collectionName).findOne({ reportImageId: id });

        await LoggerService.logEvent({
            action: "FETCH_REPORT_IMAGE_BY_ID",
            resourceType: "REPORT_IMAGE",
            resourceId: id,
            userInfo: LoggerService.extractUserInfo(req),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            found: !!result,
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);

        if (!result) {
            return res.status(404).json({ token: '404', response: 'ReportImage not found' });
        }

        // Add file info
        const reportImageWithFileInfo = {
            ...result,
            hasFile: result.fileName ? true : false,
            fileSize: result.fileName ? result.fileName.size : null
        };

        return res.json({
            token: '200',
            ReportImage: reportImageWithFileInfo
        });
    } catch (err) {
        await LoggerService.logError({
            action: "FETCH_REPORT_IMAGE_BY_ID",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);
        return next(err);
    }
};

const update_reportImage = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.REPORT_IMAGE_COLLECTION;

        const id = req.params.id;
        const { appId, appName, orgId, orgName, name, description, modifiedBy, removeFile } = req.body;

        if (!ObjectId.isValid(id)) {
            await LoggerService.logError({
                action: "UPDATE_REPORT_IMAGE",
                error: new Error("Invalid ID format"),
                userInfo: LoggerService.extractUserInfo(req),
                requestData: LoggerService.sanitizePayload(req.body),
                responseTime: LoggerService.calculateResponseTime(startTime)
            }, LoggerService.MODULES.REPORT_IMAGE);
            return res.status(400).json({ token: '400', response: 'Invalid ID format' });
        }

        // Get existing report image
        const existingReportImage = await db.collection(collectionName).findOne({ reportImageId: id });

        if (!existingReportImage) {
            return res.status(404).json({ token: '404', response: 'ReportImage not found' });
        }

        // Handle file removal if requested
        let currentFile = existingReportImage.fileName;

        if (removeFile === 'true' || removeFile === true) {
            if (currentFile && currentFile.fileId) {
                try {
                    const { deleteReportImage } = await import('./report_image_gridfs_service.js');
                    await deleteReportImage(currentFile.fileId);
                    currentFile = null;
                } catch (deleteError) {
                    console.error('Error deleting file:', deleteError);
                }
            }
        }

        // Handle new file upload if provided
        if (req.file) {
            // Delete old file if exists
            if (currentFile && currentFile.fileId) {
                try {
                    const { deleteReportImage } = await import('./report_image_gridfs_service.js');
                    await deleteReportImage(currentFile.fileId);
                } catch (deleteError) {
                    console.error('Error deleting old file:', deleteError);
                }
            }

            // Upload new file
            try {
                const uploadResult = await uploadReportImage(
                    req.file.buffer,
                    req.file.originalname,
                    req.file.mimetype,
                    {
                        reportImageId: existingReportImage.reportImageId,
                        appId: appId || existingReportImage.appId,
                        orgId: orgId || existingReportImage.orgId,
                        uploadedBy: modifiedBy || existingReportImage.createdBy
                    }
                );
                currentFile = {
                    fileId: uploadResult.fileId.toString(),
                    filename: uploadResult.filename,
                    contentType: uploadResult.contentType,
                    size: uploadResult.size
                };
            } catch (uploadError) {
                console.error('Error uploading new file:', uploadError);
                return res.status(500).json({
                    token: '500',
                    response: 'Error uploading file'
                });
            }
        }

        const updateData = {
            ...(appId && { appId }),
            ...(appName !== undefined && { appName }),
            ...(orgId && { orgId }),
            ...(orgName !== undefined && { orgName }),
            ...(name !== undefined && { name }),
            ...(description !== undefined && { description }),
            fileName: currentFile,
            modifiedBy: modifiedBy || null,
            modifiedOn: new Date()
        };

        const result = await db.collection(collectionName).updateOne(
            { reportImageId: id },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ token: '404', response: 'ReportImage not found' });
        }

        const updatedReportImage = await db.collection(collectionName).findOne({ reportImageId: id });

        await LoggerService.logAudit({
            action: "UPDATE_REPORT_IMAGE",
            resourceType: "REPORT_IMAGE",
            resourceId: id,
            userInfo: LoggerService.extractUserInfo(req),
            dataBefore: LoggerService.sanitizePayload(existingReportImage),
            dataAfter: LoggerService.sanitizePayload(updatedReportImage),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);

        return res.json({
            token: '200',
            ReportImage: {
                ...updatedReportImage,
                hasFile: updatedReportImage.fileName ? true : false,
                fileSize: updatedReportImage.fileName ? updatedReportImage.fileName.size : null
            },
            response: 'ReportImage updated successfully'
        });
    } catch (err) {
        await LoggerService.logError({
            action: "UPDATE_REPORT_IMAGE",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            requestData: LoggerService.sanitizePayload(req.body),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);
        return next(err);
    }
};

const delete_reportImage = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.REPORT_IMAGE_COLLECTION;

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            await LoggerService.logError({
                action: "DELETE_REPORT_IMAGE",
                error: new Error("Invalid ID format"),
                userInfo: LoggerService.extractUserInfo(req),
                requestData: { id },
                responseTime: LoggerService.calculateResponseTime(startTime)
            }, LoggerService.MODULES.REPORT_IMAGE);
            return res.status(400).json({ token: '400', response: 'Invalid ID format' });
        }

        // Get report image to check for file before deleting
        const reportImage = await db.collection(collectionName).findOne({ reportImageId: id });

        if (!reportImage) {
            await LoggerService.logError({
                action: "DELETE_REPORT_IMAGE",
                error: new Error("ReportImage not found"),
                userInfo: LoggerService.extractUserInfo(req),
                requestData: { id },
                responseTime: LoggerService.calculateResponseTime(startTime)
            }, LoggerService.MODULES.REPORT_IMAGE);
            return res.status(404).json({ token: '404', response: 'ReportImage not found' });
        }

        // Delete file from GridFS if exists
        if (reportImage.fileName && reportImage.fileName.fileId) {
            const { deleteReportImage } = await import('./report_image_gridfs_service.js');
            try {
                await deleteReportImage(reportImage.fileName.fileId);
            } catch (deleteError) {
                console.error('Error deleting file from GridFS:', deleteError);
            }
        }

        const result = await db.collection(collectionName).deleteOne({ reportImageId: id });

        if (result.deletedCount === 1) {
            await LoggerService.logAudit({
                action: "DELETE_REPORT_IMAGE",
                resourceType: "REPORT_IMAGE",
                resourceId: id,
                userInfo: LoggerService.extractUserInfo(req),
                dataBefore: LoggerService.sanitizePayload(reportImage),
                requestMetadata: LoggerService.extractRequestMetadata(req),
                responseTime: LoggerService.calculateResponseTime(startTime)
            }, LoggerService.MODULES.REPORT_IMAGE);
            return res.json({ token: '200', id, response: 'ReportImage and file deleted successfully' });
        } else {
            return res.status(404).json({ token: '404', response: 'ReportImage not found' });
        }
    } catch (err) {
        await LoggerService.logError({
            action: "DELETE_REPORT_IMAGE",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            requestData: { id },
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);
        return next(err);
    }
};

const get_file = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const { fileId } = req.params;
        const { getReportImage, getReportImageMetadata } = await import('./report_image_gridfs_service.js');

        // Get metadata first to set correct content type
        const metadata = await getReportImageMetadata(fileId);
        const fileBuffer = await getReportImage(fileId);

        await LoggerService.logEvent({
            action: "FETCH_REPORT_IMAGE_FILE",
            resourceType: "REPORT_IMAGE_FILE",
            resourceId: fileId,
            userInfo: LoggerService.extractUserInfo(req),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            fileSize: fileBuffer.length,
            contentType: metadata.contentType,
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);

        res.set('Content-Type', metadata.contentType);
        res.set('Content-Disposition', `inline; filename="${metadata.filename}"`);
        res.send(fileBuffer);
    } catch (err) {
        await LoggerService.logError({
            action: "FETCH_REPORT_IMAGE_FILE",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            requestData: { fileId: req.params.fileId },
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);
        if (err.message.includes('not found')) {
            return res.status(404).json({ token: '404', response: 'File not found' });
        }
        return next(err);
    }
};

const get_all_files = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const { getAllReportImages } = await import('./report_image_gridfs_service.js');
        const files = await getAllReportImages();

        await LoggerService.logEvent({
            action: "FETCH_ALL_REPORT_IMAGE_FILES",
            resourceType: "REPORT_IMAGE_FILE",
            userInfo: LoggerService.extractUserInfo(req),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            resultCount: files.length,
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);

        return res.json({
            token: '200',
            files: files,
            count: files.length
        });
    } catch (err) {
        await LoggerService.logError({
            action: "FETCH_ALL_REPORT_IMAGE_FILES",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);
        return next(err);
    }
};

const verify_file_chunks = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const { fileId } = req.params;
        const { verifyReportImageChunks } = await import('./report_image_gridfs_service.js');

        const verification = await verifyReportImageChunks(fileId);

        await LoggerService.logEvent({
            action: "VERIFY_REPORT_IMAGE_FILE_CHUNKS",
            resourceType: "REPORT_IMAGE_FILE",
            resourceId: fileId,
            userInfo: LoggerService.extractUserInfo(req),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            verificationResult: verification,
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);

        return res.json({
            token: '200',
            verification: verification,
            chunksStored: verification.chunkCount > 0,
            chunksMatch: verification.chunkCount === verification.expectedChunks
        });
    } catch (err) {
        await LoggerService.logError({
            action: "VERIFY_REPORT_IMAGE_FILE_CHUNKS",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            requestData: { fileId: req.params.fileId },
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.REPORT_IMAGE);
        return next(err);
    }
};

const get_file_by_filename = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.REPORT_IMAGE_COLLECTION;

        const filename = req.params.filename;

        console.log(filename);

        // Find record by actual stored filename
        const record = await db.collection(collectionName).findOne({
            "name": filename
        });

        if (!record || !record.fileName || !record.fileName.fileId) {
            return res.status(404).json({ token: "404", response: "File not found" });
        }

        const fileId = record.fileName.fileId;

        // Fetch file from GridFS
        const { getReportImage, getReportImageMetadata } = await import('./report_image_gridfs_service.js');

        const metadata = await getReportImageMetadata(fileId);
        const fileBuffer = await getReportImage(fileId);

        res.set('Content-Type', metadata.contentType);
        res.set('Content-Disposition', `inline; filename="${metadata.filename}"`);
        res.send(fileBuffer);

    } catch (err) {
        console.error(err);
        return next(err);
    }
};



export default {
    post_reportImage,
    get_reportImage,
    get_reportImage_by_id,
    update_reportImage,
    delete_reportImage,
    get_file,
    get_all_files,
    verify_file_chunks,
    get_file_by_filename
};