const express = require("express");
const router = express.Router();

const { verifyToken } = require('../middleware/authmiddleware');
const upload = require("../middleware/upload");

const {
  checkIn,
  trackLocation,
  checkOut,
  getAttendance,
  updateAttendance,
  deleteAttendance,
  checkLocation,
  getTodayAttendance,
  autoCheckOut,
  startBreak,
  endBreak,
  getAttendanceDashboard,
  getHRDashboardAttendance
} = require("../controllers/attendanceController");


router.get('/dashboard', verifyToken,getAttendanceDashboard );
router.get("/hr-dashboard",verifyToken,getHRDashboardAttendance);

// router.post("/check-in", verifyToken, upload.single("image"), checkIn);
router.post("/check-in", verifyToken,  upload.single("image"),  checkIn);
router.post("/track", verifyToken, trackLocation);
router.post("/check-out", verifyToken, upload.single("image"), checkOut);

router.post('/check-location',verifyToken,checkLocation)
router.post('/auto-checkout',verifyToken,autoCheckOut)
router.get('/today', verifyToken, getTodayAttendance);

router.get("/employee/:employee_id", verifyToken, getAttendance); 
router.put("/:id", verifyToken, updateAttendance);
router.delete("/:id", verifyToken, deleteAttendance);

router.post('/start-break',startBreak)
router.post('/end-break',endBreak)

module.exports = router;