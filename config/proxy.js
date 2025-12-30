import express from 'express';
import axios from 'axios';
import https from 'https';
import cors from 'cors';

const router = express.Router();

// Create axios instance with custom config
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false // Allow self-signed certificates
  }),
  timeout: 30000 // 30 second timeout
});

// Proxy endpoint
router.post('/chat-db', async (req, res) => {
  try {
    // The actual API URL
    const TARGET_API_URL = 'https://opsinsight-server.cml.apps.cdp-ds-test.aramco.com/chat-db';
    
    console.log('Sending request to:', TARGET_API_URL);
    console.log('Request body:', req.body);
    
    // Forward the request to the target API
    const response = await axiosInstance.post(TARGET_API_URL, req.body, {
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    // console.log('Response status:', response.status);
    // console.log('Response data:', response.data);

     let parsedData = response.data;

    if (typeof response.data?.response === 'string') {
      try {
        parsedData = JSON.parse(response.data.response);
      } catch (e) {
        console.warn('Failed to parse response.response as JSON:', e.message);
      }
    }

    // Send the API response back to frontend
    res.status(response.status).json(parsedData);
    
  } catch (error) {
    // Handle errors
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      response: error.response?.data
    });
    
    if (error.response) {
      // API responded with error status
      res.status(error.response.status).json({
        error: 'API Error',
        message: error.response.data,
        status: error.response.status
      });
    } else if (error.request) {
      // Request made but no response received
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'No response from API. Check if the API is accessible from your network.',
        details: error.message,
        code: error.code
      });
    } else {
      // Other errors
      res.status(500).json({
        error: 'Server Error',
        message: error.message
      });
    }
  }
});

// Health check endpoint
router.get('/health', (_req, res) => {
  res.json({ status: 'OK', message: 'Proxy server is running' });
});

export default router;