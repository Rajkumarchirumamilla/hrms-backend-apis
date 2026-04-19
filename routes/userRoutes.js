const express = require("express");
const router = express.Router();

const auth = require("../Middleware/authmiddleware");
const {
  getProfile,
  updateProfile,
  changePassword
} = require("../controllers/userController");

router.get("/profile", auth, getProfile);
router.put("/profile", auth, updateProfile);
router.put("/change-password", auth, changePassword);

module.exports = router;