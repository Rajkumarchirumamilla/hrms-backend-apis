const express = require("express");
const router = express.Router();

// ✅ IMPORT CONTROLLER FUNCTIONS
const {
  addDepartment,
  getDepartments,
  updateDepartment,
  deleteDepartment
} = require("../controllers/departmentsController");



router.post("/add-department", addDepartment);
router.get("/getall", getDepartments);
router.put("/update-department", updateDepartment);
router.delete("/delete-department", deleteDepartment);


module.exports = router