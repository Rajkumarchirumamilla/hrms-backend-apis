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
  deleteAttendance
} = require("../controllers/attendanceController");

// router.post("/check-in", verifyToken, upload.single("image"), checkIn);
router.post("/check-in", verifyToken,  checkIn);
router.post("/track", verifyToken, trackLocation);
router.post("/check-out", verifyToken, upload.single("image"), checkOut);

router.get("/employee/:employee_id", verifyToken, getAttendance); 
router.put("/:id", verifyToken, updateAttendance);
router.delete("/:id", verifyToken, deleteAttendance);

module.exports = router;