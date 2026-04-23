

const express = require("express");
const router = express.Router();

const {
  applyLeave,
  getLeaves,
  getLeavesByEmployee,
  updateLeaveStatus,
  deleteLeave
} = require("../controllers/leaveController");


router.post("/apply-leave", applyLeave);
router.get("/leaves", getLeaves);
router.get("/leaves/:employee_id", getLeavesByEmployee);
router.put("/leave-status/:id", updateLeaveStatus);
router.delete("/leave/:id", deleteLeave);