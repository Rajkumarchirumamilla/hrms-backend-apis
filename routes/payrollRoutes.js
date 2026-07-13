const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const { verifyToken } = require('../middleware/authmiddleware');
const roleMiddleware = require('../middleware/rolemiddleware');
const { getAttendanceForPayroll, updateAttendanceForPayroll, bulkUpdateAttendance } = require('../controllers/attendanceController');

// All routes require authentication
router.use(verifyToken);

// Payroll batch management
router.post('/batch/create', 
    roleMiddleware.checkRole('super_admin', 'org_admin',"Hr"), 
    payrollController.createPayrollBatch
);

    router.get(
'/batches',
roleMiddleware.checkRole(
   'super_admin',
   'org_admin',
   'Hr'
),
payrollController.getPayrollBatches
);

router.get('/batch/:batchId', 
    roleMiddleware.checkRole('super_admin', 'org_admin', 'Hr'), 
    payrollController.getPayrollBatchDetails
);

// Payroll process steps
router.get('/batch/:batchId/step/:stepNumber', 
    roleMiddleware.checkRole('super_admin', 'org_admin','Hr'), 
    payrollController.getPayrollStepData
);

router.post('/batch/:batchId/step/:stepNumber/approve', 
    roleMiddleware.checkRole('super_admin', 'org_admin','Hr'),      
    payrollController.approvePayrollStep
);

router.post('/batch/:batchId/step/:stepNumber/reject', 
    roleMiddleware.checkRole(['super_admin', 'org_admin']), 
    payrollController.rejectPayrollStep
);

// Compensation management
router.put('/batch/:batchId/employee/:employeeId/compensation', 
    roleMiddleware.checkRole(['super_admin', 'org_admin']), 
    payrollController.updateEmployeeCompensation
);

// Attendance management

router.get('/batch/:batchId/attendance', 
    roleMiddleware.checkRole('super_admin', 'org_admin', 'Hr'), 
    getAttendanceForPayroll
);

router.put('/batch/:batchId/employee/:employeeId/attendance', 
    roleMiddleware.checkRole('super_admin', 'org_admin','Hr'), 
    updateAttendanceForPayroll    
);

router.post('/batch/:batchId/attendance/bulk', 
    roleMiddleware.checkRole('super_admin', 'org_admin', 'Hr'), 
    bulkUpdateAttendance
);
// IT Declarations
router.put('/batch/:batchId/employee/:employeeId/it-declaration', 
    roleMiddleware.checkRole(['super_admin', 'org_admin']), 
    payrollController.updateITDeclaration
);

// Leave encashment
router.put('/batch/:batchId/employee/:employeeId/leave', 
    roleMiddleware.checkRole(['super_admin', 'org_admin']), 
    payrollController.updateLeaveEncashment
);

// Finalize payroll
router.post('/batch/:batchId/finalize', 
    roleMiddleware.checkRole('super_admin', 'org_admin','Hr'), 
    payrollController.finalizePayroll
);

// Download payroll report
router.get('/batch/:batchId/download', 
    roleMiddleware.checkRole(['super_admin', 'org_admin']), 
    payrollController.downloadPayrollReport
);


// Get employee payslips
router.get('/payroll/:employeeId', verifyToken, payrollController.getEmployeePayslips);

module.exports = router;    