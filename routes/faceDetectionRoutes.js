// backend/routes/faceDetectionRoutes.js
// Bridges React Native → Node.js → Python face detection service

const express = require('express');
const router = express.Router();
const axios = require('axios');

const PYTHON_SERVICE_URL = 'https://hrms-facedetection.onrender.com';

// ─── POST /api/face/detect-face ───────────────────────────────────────────────
// Called continuously by the mobile app (every ~800ms) while the camera is open.
// Forwards the frame to Python, returns the detection result.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/detect-face', async (req, res) => {
  try {
    const { image, circleCenter, circleRadius } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'Image data is required',
        isFaceCentered: false,
        hasFace: false,
      });
    }

    // Forward to Python service
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/face/detect-face`,
      { image, circleCenter, circleRadius },
      {
        timeout: 30000, // 5s timeout — important for real-time feel
        headers: { 'Content-Type': 'application/json' },
        validateStatus: (status) => status < 500,
      }
    );

    if (response.status !== 200) {
      return res.status(response.status).json({
        success: false,
        hasFace: false,
        isFaceCentered: false,
        error: `Python service error: ${response.status}`,
      });
    }

    const py = response.data;

    // Normalise and forward result to mobile app
    const result = {
      success: true,
      hasFace: py.hasFace === true,
      isFaceCentered: py.isFaceCentered === true,
      isSizeOk: py.isSizeOk === true,
      message: py.message || '',
      distance: py.distance ?? null,
      faceSize: py.faceSize ?? null,
      processingMs: py.processingMs ?? null,
    };

    res.json(result);

  } catch (error) {
    // On timeout or connection error — treat as "face not found"
    // so the capture button stays disabled
    console.error('❌ Face detection route error:', error.message);

    res.status(500).json({
      success: false,
      error: 'Face detection service unavailable',
      isFaceCentered: false,
      hasFace: false,
      message: error.message,
    });
  }
});


// ─── GET /api/face/health ─────────────────────────────────────────────────────
// Health check — called once on app startup to verify both services are up.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    const pythonHealth = await axios.get(
      `${PYTHON_SERVICE_URL}/health`,
      { timeout: 2000 }
    );

    res.json({
      success: true,
      nodeServer: 'running',
      pythonService: 'connected',
      pythonStatus: pythonHealth.data,
    });

  } catch (error) {
    console.warn('⚠️  Python service not responding:', error.message);
    res.json({
      success: true,
      nodeServer: 'running',
      pythonService: 'disconnected',
      message: 'Make sure Python Flask app is running on port 5001',
    });
  }
});

module.exports = router;