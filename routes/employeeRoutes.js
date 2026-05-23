const express = require("express");
const router = express.Router();

const {
  getEmployees,
  getEmployeeById,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeesByBranch,
  assignEmployeeBranch
} = require("../controllers/employeeController");
const { verifyToken } = require("../middleware/authmiddleware");


router.get("/:organization_id", getEmployees);
router.get("/:id", getEmployeeById);
router.post("/", addEmployee);
router.put("/:id", updateEmployee);
router.delete("/:id", deleteEmployee);

// In your routes file, add these new routes:

// Get employees by branch
router.get('/employees/branch/:branch_id', getEmployeesByBranch);

// Assign employee to branch
router.patch('/employees/:id/assign-branch', assignEmployeeBranch);

module.exports = router;