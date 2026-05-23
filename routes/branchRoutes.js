const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const authMiddleware = require('../middleware/authMiddleware');


// Branch routes
router.post('/branches', branchController.createBranch);
router.get('/:organization_id', branchController.getAllBranches);
router.get('/branches/:id', branchController.getBranchById);
router.put('/branches/:id', branchController.updateBranch);
router.delete('/branches/:id', branchController.deleteBranch);
router.patch('/branches/:id/status', branchController.updateBranchStatus);

// Branch employees routes
router.get('/branches/:branchId/employees', branchController.getEmployeesByBranch);
router.get('/branches/:branchId/employees/count', branchController.getEmployeeCountByBranch);

// Employee branch assignment
router.patch('/employees/:employeeId/branch', branchController.assignEmployeeBranch);
router.get('/employees/branch/statistics', branchController.getBranchStatistics);

module.exports = router;