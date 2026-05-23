const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/rolemiddleware');

// All routes require authentication
router.use(authMiddleware.verifyToken);

// Super admin only routes
router.post('/', 
    roleMiddleware.checkRole(['super_admin']), 
    organizationController.createOrganization
);

router.get('/all', 
    roleMiddleware.checkRole(['super_admin']), 
    organizationController.getAllOrganizations
);

router.put('/subscription/:id', 
    roleMiddleware.checkRole(['super_admin']), 
    organizationController.updateSubscription
);

// Routes accessible by super admin and org_admin
router.get('/:id', 
    roleMiddleware.checkRole(['super_admin', 'org_admin']), 
    organizationController.getOrganizationById
);

router.put('/:id', 
    roleMiddleware.checkRole(['super_admin', 'org_admin']), 
    organizationController.updateOrganization
);

router.delete('/:id', 
    roleMiddleware.checkRole(['super_admin']), 
    organizationController.deleteOrganization
);

router.get('/:id/stats', 
    roleMiddleware.checkRole(['super_admin', 'org_admin']), 
    organizationController.getOrganizationStats
);

// Add these routes
router.get('/dashboard-stats/:organizationId', 
    // roleMiddleware.checkRole(['super_admin', 'org_admin']), 
    organizationController.getDashboardStats
);

router.get('/:employeeId/employee-dashboard', 
 roleMiddleware.checkRole(['super_admin', 'org_admin']),     organizationController.getEmployeeDashboardStats
);

module.exports = router;