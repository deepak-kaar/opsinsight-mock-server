import express from 'express';
import flags from './flag.js';
const router = express.Router();

/**
 * @swagger
 * /postFlag:
 *   post:
 *     tags:
 *       - Flag Route
 *     summary: Create a new flag
 *     description: Register a new flag configuration
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Flag created successfully
 *       400:
 *         description: Bad request
 */
router.route('/postFlag').post(flags.post_flag);

/**
 * @swagger
 * /validateFlag:
 *   post:
 *     tags:
 *       - Flag Route
 *     summary: Validate a flag
 *     description: Validate flag configuration
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Flag validated successfully
 *       400:
 *         description: Validation failed
 */
router.route('/validateFlag').post(flags.validate_Flag);

/**
 * @swagger
 * /getFlag:
 *   post:
 *     tags:
 *       - Flag Route
 *     summary: Get flags with filters
 *     description: Retrieve flags based on filter criteria
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Flags retrieved successfully
 *       400:
 *         description: Bad request
 */
router.route('/getFlag').post(flags.get_flag);

/**
 * @swagger
 * /getFlag/{id}:
 *   get:
 *     tags:
 *       - Flag Route
 *     summary: Get flag by ID
 *     description: Retrieve a specific flag by its ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Flag ID
 *     responses:
 *       200:
 *         description: Flag retrieved successfully
 *       404:
 *         description: Flag not found
 */
router.route('/getFlag/:id').get(flags.get_template_ID);

/**
 * @swagger
 * /updateFlag:
 *   post:
 *     tags:
 *       - Flag Route
 *     summary: Update an existing flag
 *     description: Update flag configuration
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Flag updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Flag not found
 */
router.route('/updateFlag').post(flags.update_flag);

/**
 * @swagger
 * /deleteFlag/{id}:
 *   get:
 *     tags:
 *       - Flag Route
 *     summary: Delete a flag by ID
 *     description: Remove a flag from the system
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Flag ID
 *     responses:
 *       200:
 *         description: Flag deleted successfully
 *       404:
 *         description: Flag not found
 */
router.route('/deleteFlag/:id').get(flags.delete_flag);

export default router;