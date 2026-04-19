const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const {
  checkIn,
  trackLocation,
  checkOut,
  getAttendance,
  updateAttendance,
  deleteAttendance
} = require("../controllers/attendanceController");

router.post("/check-in", auth, upload.single("image"), checkIn);
router.post("/track", auth, trackLocation);
router.post("/check-out", auth, upload.single("image"), checkOut);

router.get("/employee/:employee_id", auth, getAttendance);
router.put("/:id", auth, updateAttendance);
router.delete("/:id", auth, deleteAttendance);

module.exports = router;