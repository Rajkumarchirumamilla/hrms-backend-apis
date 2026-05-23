const express = require('express');
const router = express.Router();
const salaryController = require('../controllers/salaryController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Employee salary routes (employees can view their own salary)
router.get('/my-salary', async (req, res) => {
    // Reuse getSalaryByEmployeeId with logged-in user's ID
    req.params.employee_id = req.user.id;
    return salaryController.getSalaryByEmployeeId(req, res);
});

router.get('/my-salary/history', async (req, res) => {
    req.params.employee_id = req.user.id;
    return salaryController.getSalaryHistory(req, res);
});

// Admin/HR only routes
router.post('/add', authorize(['admin', 'hr']), salaryController.addOrUpdateSalary);
router.put('/update/:id', authorize(['admin', 'hr']), salaryController.addOrUpdateSalary);
router.get('/employee/:employee_id', authorize(['admin', 'hr']), salaryController.getSalaryByEmployeeId);
router.get('/all', authorize(['admin', 'hr']), salaryController.getAllSalaries);
router.get('/history/:employee_id', authorize(['admin', 'hr']), salaryController.getSalaryHistory);
router.delete('/delete/:id', authorize(['admin']), salaryController.deleteSalaryRecord);
router.post('/calculate-monthly', authorize(['admin', 'hr']), salaryController.calculateMonthlySalary);

module.exports = router;