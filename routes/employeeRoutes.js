const express = require("express");
const router = express.Router();

const {
  getEmployees,
  getEmployeeById,
  addEmployee,
  updateEmployee,
  deleteEmployee
} = require("../controllers/employeeController");

// READ
router.get("/", getEmployees);
router.get("/:id", getEmployeeById);

// CREATE
router.post("/", addEmployee);

// UPDATE
router.put("/:id", updateEmployee);

// DELETE
router.delete("/:id", deleteEmployee);

module.exports = router;