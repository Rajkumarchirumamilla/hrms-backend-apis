const express = require("express");
const { applyLeave, getMyLeaves, getLeaveBalance, updateLeaveStatus, approveLeave,getAllLeaves ,editLeave} = require("../controllers/leaveController");
const { verifyToken } = require("../middleware/authmiddleware");
const router = express.Router();


    

router.post("/apply-leave",verifyToken, applyLeave);
router.get("/my",verifyToken, getMyLeaves);
router.get("/balance", verifyToken,getLeaveBalance);
router.put("/:id/status" ,updateLeaveStatus );
router.get("/all", verifyToken, getAllLeaves);
router.put("/:id/edit",verifyToken,editLeave);


module.exports = router;    