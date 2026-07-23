const express = require("express");
const router = express.Router();

const {
  getNotifications,
  markAsRead,
} = require("../controllers/notificationController");

const { verifyToken } = require("../middleware/authmiddleware");

// Get all notifications for logged-in user
router.get("/", verifyToken, getNotifications);

// Mark a notification as read
router.put("/:id/read", verifyToken, markAsRead);

module.exports = router;