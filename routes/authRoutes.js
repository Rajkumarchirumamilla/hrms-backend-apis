const router = require('express').Router();
const auth = require('../controllers/authController');
const { verifyToken } = require('../middleware/authmiddleware');

router.post('/register', auth.register);
router.post('/login', auth.login);
router.post("/send-otp", auth.sendOtp);
router.post("/reset-password", auth.resetPassword);
router.get("/profile", verifyToken, auth.getProfile);
router.get("/dashboard-stats",verifyToken, auth.getDashboardStats);

router.put('/update', verifyToken, auth.updateProfile);
router.put('/change-password', verifyToken, auth.changePassword);
router.post('/upload-image', verifyToken, auth.uploadProfileImage);

module.exports = router;