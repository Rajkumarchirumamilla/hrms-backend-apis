const db = require("../config/db");
const bcrypt = require("bcrypt");


exports.createOrganization = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const {
            organization_code,
            name,
            email,
            phone,
            address,
            city,
            state,
            country,
            postal_code,
            website,
            subscription_plan = 'trial',
            subscription_end_date,
            max_employees = 100,
            max_departments = 10,
            admin_email,
            admin_password,
            admin_first_name,
            admin_last_name,
            admin_phone
        } = req.body;
        
        // Check if organization code exists
        const [existingOrg] = await connection.query(
            "SELECT id FROM organizations WHERE organization_code = ? OR email = ?",
            [organization_code, email]
        );
        
        if (existingOrg.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Organization code or email already exists"
            });
        }
        
        // Calculate subscription dates
        const startDate = new Date();
        let endDate = null;
        if (subscription_end_date) {
            endDate = new Date(subscription_end_date);
        } else if (subscription_plan === 'trial') {
            endDate = new Date();
            endDate.setDate(endDate.getDate() + 30); // 30 days trial
        }
        
        // Insert organization
        const [orgResult] = await connection.query(
            `INSERT INTO organizations 
             (organization_code, name, email, phone, address, city, state, country, 
              postal_code, website, subscription_plan, subscription_start_date, 
              subscription_end_date, max_employees, max_departments, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
            [organization_code, name, email, phone, address, city, state, country, 
             postal_code, website, subscription_plan, startDate, endDate, 
             max_employees, max_departments]
        );
        
        const organizationId = orgResult.insertId;
        
        // Hash admin password
        const hashedPassword = await bcrypt.hash(admin_password, 10);
        
        // Create organization admin user
        const [userResult] = await connection.query(
            `INSERT INTO users 
             (organization_id, email, password, first_name, last_name, phone, role, is_active) 
             VALUES (?, ?, ?, ?, ?, ?, 'org_admin', true)`,
            [organizationId, admin_email, hashedPassword, admin_first_name, admin_last_name, admin_phone]
        );
        
        // Create employee record for the admin
        const employeeCode = `EMP${organizationId}${Date.now()}`;
        await connection.query(
            `INSERT INTO employees 
             (organization_id, user_id, employee_code, joining_date, employment_type, status) 
             VALUES (?, ?, ?, CURDATE(), 'full_time', 'active')`,
            [organizationId, userResult.insertId, employeeCode]
        );
        
        await connection.commit();
        
        res.status(201).json({
            success: true,
            message: "Organization created successfully",
            data: {
                organization_id: organizationId,
                organization_code,
                name,
                admin_email
            }
        });
        
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Failed to create organization",
            error: err.message
        });
    } finally {
        connection.release();
    }
};

// Get all organizations (super admin only)
exports.getAllOrganizations = async (req, res) => {
    try {
        const [result] = await db.query(`
            SELECT 
                o.*,
                COUNT(DISTINCT u.id) as total_users,
                COUNT(DISTINCT e.id) as total_employees,
                COUNT(DISTINCT d.id) as total_departments
            FROM organizations o
            LEFT JOIN users u ON o.id = u.organization_id
            LEFT JOIN employees e ON o.id = e.organization_id
            LEFT JOIN departments d ON o.id = d.organization_id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `);
        
        res.status(200).json({
            success: true,
            data: result
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch organizations",
            error: err.message
        });
    }
};

// Get organization by ID
exports.getOrganizationById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await db.query(`
            SELECT 
                o.*,
                COUNT(DISTINCT u.id) as total_users,
                COUNT(DISTINCT e.id) as total_employees,
                COUNT(DISTINCT d.id) as total_departments
            FROM organizations o
            LEFT JOIN users u ON o.id = u.organization_id
            LEFT JOIN employees e ON o.id = e.organization_id
            LEFT JOIN departments d ON o.id = d.organization_id
            WHERE o.id = ?
            GROUP BY o.id
        `, [id]);
        
        if (!result.length) {
            return res.status(404).json({
                success: false,
                message: "Organization not found"
            });
        }
        
        res.status(200).json({
            success: true,
            data: result[0]
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch organization",
            error: err.message
        });
    }
};

// Update organization
exports.updateOrganization = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const allowedUpdates = ['name', 'email', 'phone', 'address', 'city', 'state', 
                                'country', 'postal_code', 'website', 'logo_url', 
                                'subscription_plan', 'max_employees', 'max_departments', 'status'];
        
        const updateFields = [];
        const updateValues = [];
        
        for (const field of allowedUpdates) {
            if (updates[field] !== undefined) {
                updateFields.push(`${field} = ?`);
                updateValues.push(updates[field]);
            }
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields to update"
            });
        }
        
        updateValues.push(id);
        const query = `UPDATE organizations SET ${updateFields.join(', ')} WHERE id = ?`;
        
        const [result] = await db.query(query, updateValues);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Organization not found"
            });
        }
        
        res.status(200).json({
            success: true,
            message: "Organization updated successfully"
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Failed to update organization",
            error: err.message
        });
    }
};

// Update subscription
exports.updateSubscription = async (req, res) => {
    try {
        const { id } = req.params;
        const { subscription_plan, subscription_end_date, max_employees, max_departments } = req.body;
        
        const [result] = await db.query(
            `UPDATE organizations 
             SET subscription_plan = ?, subscription_end_date = ?, max_employees = ?, max_departments = ? 
             WHERE id = ?`,
            [subscription_plan, subscription_end_date, max_employees, max_departments, id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Organization not found"
            });
        }
        
        res.status(200).json({
            success: true,
            message: "Subscription updated successfully"
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Failed to update subscription",
            error: err.message
        });
    }
};

// Delete organization (soft delete by changing status)
exports.deleteOrganization = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await db.query(
            "UPDATE organizations SET status = 'inactive' WHERE id = ?",
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Organization not found"
            });
        }
        
        res.status(200).json({
            success: true,
            message: "Organization deactivated successfully"
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Failed to deactivate organization",
            error: err.message
        });
    }
};

// Get organization statistics
exports.getOrganizationStats = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [stats] = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE organization_id = ? AND role = 'employee') as total_employees,
                (SELECT COUNT(*) FROM users WHERE organization_id = ? AND role = 'hr_manager') as total_hr_managers,
                (SELECT COUNT(*) FROM departments WHERE organization_id = ? AND status = 'active') as total_departments,
                (SELECT COUNT(*) FROM designations WHERE organization_id = ? AND status = 'active') as total_designations,
                (SELECT COUNT(*) FROM employees WHERE organization_id = ? AND status = 'active') as active_employees,
                (SELECT COUNT(*) FROM employees WHERE organization_id = ? AND status = 'inactive') as inactive_employees,
                (SELECT COUNT(*) FROM employees WHERE organization_id = ? AND employment_type = 'full_time') as full_time_employees,
                (SELECT COUNT(*) FROM employees WHERE organization_id = ? AND employment_type = 'part_time') as part_time_employees
            `, [id, id, id, id, id, id, id, id]);
        
        res.status(200).json({
            success: true,
            data: stats[0]
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch organization statistics",
            error: err.message
        });
    }
};




// Get dashboard statistics for organization
// Get dashboard statistics for organization
exports.getDashboardStats = async (req, res) => {
    try {
        // Get organization ID from params (supports both 'id' and 'organizationId')
        const organizationId = req.params.id || req.params.organizationId;
        
        if (!organizationId) {
            return res.status(400).json({
                success: false,
                message: "Organization ID is required"
            });
        }
        
        console.log('Dashboard stats for organization:', organizationId);
        
        // Get current month and year
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        
        // 1. Get payroll summary for current month
        const [payrollStats] = await db.query(`
            SELECT 
                COALESCE(SUM(sd.basic_salary + sd.hra + sd.da + sd.special_allowance + sd.other_allowances), 0) as gross_payroll,
                COALESCE(SUM(sd.net_salary), 0) as net_payroll,
                COUNT(DISTINCT sd.employee_id) as employees_processed
            FROM salary_structures sd
            INNER JOIN employees e ON sd.employee_id = e.id
            WHERE e.organization_id = ? 
                AND MONTH(sd.effective_from) = ? 
                AND YEAR(sd.effective_from) = ?
        `, [organizationId, currentMonth, currentYear]);
        
        // 2. Get employee statistics
        const [employeeStats] = await db.query(`
            SELECT 
                COUNT(*) as total_employees,
                SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) as active_employees,
                SUM(CASE WHEN e.status = 'inactive' THEN 1 ELSE 0 END) as inactive_employees,
                SUM(CASE WHEN e.employment_type = 'full_time' THEN 1 ELSE 0 END) as full_time_employees,
                SUM(CASE WHEN e.employment_type = 'part_time' THEN 1 ELSE 0 END) as part_time_employees,
                SUM(CASE WHEN e.employment_type = 'contract' THEN 1 ELSE 0 END) as contract_employees,
                SUM(CASE WHEN MONTH(e.joining_date) = ? AND YEAR(e.joining_date) = ? THEN 1 ELSE 0 END) as new_joiners_this_month
            FROM employees e
            WHERE e.organization_id = ?
        `, [currentMonth, currentYear, organizationId]);
        
        // 3. Get deduction summary for current month
        const [deductionStats] = await db.query(`
            SELECT 
                COALESCE(SUM(sd.income_tax), 0) as total_income_tax,
                COALESCE(SUM(sd.provident_fund), 0) as total_provident_fund,
                COALESCE(SUM(sd.health_insurance), 0) as total_health_insurance,
                COALESCE(SUM(sd.professional_tax), 0) as total_professional_tax
            FROM salary_structures sd
            INNER JOIN employees e ON sd.employee_id = e.id
            WHERE e.organization_id = ? 
                AND MONTH(sd.effective_from) = ? 
                AND YEAR(sd.effective_from) = ?
        `, [organizationId, currentMonth, currentYear]);
        
        // 4. Get monthly payroll history for bar chart (last 12 months)
        const [payrollHistory] = await db.query(`
            SELECT 
                DATE_FORMAT(sd.effective_from, '%Y-%m') as month,
                COALESCE(SUM(sd.basic_salary + sd.hra + sd.da + sd.special_allowance + sd.other_allowances), 0) as gross_payroll,
                COALESCE(SUM(sd.net_salary), 0) as net_payroll,
                COUNT(DISTINCT sd.employee_id) as employee_count
            FROM salary_structures sd
            INNER JOIN employees e ON sd.employee_id = e.id
            WHERE e.organization_id = ?
                AND sd.effective_from >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
            GROUP BY DATE_FORMAT(sd.effective_from, '%Y-%m')
            ORDER BY month DESC
        `, [organizationId]);
        
        // 5. Get department-wise payroll breakdown for donut chart
        const [departmentBreakdown] = await db.query(`
            SELECT 
                d.name as department_name,
                COALESCE(SUM(sd.net_salary), 0) as total_payroll,
                COUNT(DISTINCT e.id) as employee_count
            FROM departments d
            INNER JOIN employees e ON e.department_id = d.id
            LEFT JOIN salary_structures sd ON sd.employee_id = e.id
                AND MONTH(sd.effective_from) = ? 
                AND YEAR(sd.effective_from) = ?
            WHERE d.organization_id = ? AND d.status = 'active'
            GROUP BY d.id, d.name
            ORDER BY total_payroll DESC
        `, [currentMonth, currentYear, organizationId]);
        
        // 6. Get recent payroll processing info
        const [lastProcessed] = await db.query(`
            SELECT 
                MAX(sd.effective_from) as last_processed_date,
                COUNT(DISTINCT sd.employee_id) as employees_processed
            FROM salary_structures sd
            INNER JOIN employees e ON sd.employee_id = e.id
            WHERE e.organization_id = ?
        `, [organizationId]);
        
        // 7. Get upcoming payments (if you have this data)
        const [upcomingPayments] = await db.query(`
            SELECT 
                COUNT(DISTINCT sd.employee_id) as employees_due,
                COALESCE(SUM(sd.net_salary), 0) as total_due_amount
            FROM salary_structures sd
            INNER JOIN employees e ON sd.employee_id = e.id
            WHERE e.organization_id = ?
                AND sd.effective_from > DATE_FORMAT(CURDATE(), '%Y-%m-01')
                AND sd.effective_from <= DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)
        `, [organizationId]);
        
        // Send response
        res.status(200).json({
            success: true,
            data: {
                payroll_summary: {
                    gross_payroll: parseFloat(payrollStats[0]?.gross_payroll) || 0,
                    net_payroll: parseFloat(payrollStats[0]?.net_payroll) || 0,
                    employees_processed: payrollStats[0]?.employees_processed || 0,
                    month: `${currentMonth}/${currentYear}`
                },
                employee_stats: {
                    total_employees: employeeStats[0]?.total_employees || 0,
                    active_employees: employeeStats[0]?.active_employees || 0,
                    inactive_employees: employeeStats[0]?.inactive_employees || 0,
                    full_time: employeeStats[0]?.full_time_employees || 0,
                    part_time: employeeStats[0]?.part_time_employees || 0,
                    contract: employeeStats[0]?.contract_employees || 0,
                    new_joiners: employeeStats[0]?.new_joiners_this_month || 0
                },
                deduction_summary: {
                    income_tax: parseFloat(deductionStats[0]?.total_income_tax) || 0,
                    provident_fund: parseFloat(deductionStats[0]?.total_provident_fund) || 0,
                    health_insurance: parseFloat(deductionStats[0]?.total_health_insurance) || 0,
                    professional_tax: parseFloat(deductionStats[0]?.total_professional_tax) || 0
                },
                payroll_history: payrollHistory || [],
                department_breakdown: departmentBreakdown || [],
                last_processed: {
                    date: lastProcessed[0]?.last_processed_date || null,
                    employees: lastProcessed[0]?.employees_processed || 0
                },
                upcoming_payments: {
                    employees_due: upcomingPayments[0]?.employees_due || 0,
                    total_due_amount: parseFloat(upcomingPayments[0]?.total_due_amount) || 0
                }
            }
        });
        
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard statistics",
            error: err.message
        });
    }
};

// Get employee-specific dashboard stats
exports.getEmployeeDashboardStats = async (req, res) => {
    try {
        const { id } = req.params; // employee_id
        const userId = req.user?.id; // From auth middleware
        
        // Get employee's current salary details
        const [salaryDetails] = await db.query(`
            SELECT 
                sd.basic_salary,
                sd.hra,
                sd.da,
                sd.special_allowance,
                sd.other_allowances,
                sd.income_tax,
                sd.provident_fund,
                sd.health_insurance,
                sd.professional_tax,
                sd.net_salary,
                sd.effective_from,
                e.employee_code,
                e.joining_date,
                e.employment_type,
                d.name as department_name,
                des.name as designation_name
            FROM employees e
            LEFT JOIN salary_details sd ON sd.employee_id = e.id
            LEFT JOIN departments d ON e.department_id = d.id
            LEFT JOIN designations des ON e.designation_id = des.id
            WHERE e.id = ?
            ORDER BY sd.effective_from DESC
            LIMIT 1
        `, [id]);
        
        // Get leave balance for employee
        const [leaveBalance] = await db.query(`
            SELECT 
                annual_leave,
                sick_leave,
                casual_leave,
                unpaid_leave,
                year
            FROM leave_balances
            WHERE employee_id = ? AND year = YEAR(CURDATE())
        `, [id]);
        
        // Get attendance summary for current month
        const [attendanceSummary] = await db.query(`
            SELECT 
                COUNT(*) as total_days,
                SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_days,
                SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late_days,
                SUM(CASE WHEN status = 'half_day' THEN 1 ELSE 0 END) as half_days
            FROM attendance
            WHERE employee_id = ? 
                AND MONTH(date) = MONTH(CURDATE())
                AND YEAR(date) = YEAR(CURDATE())
        `, [id]);
        
        // Get payroll history for employee (last 6 months)
        const [payrollHistory] = await db.query(`
            SELECT 
                DATE_FORMAT(effective_from, '%Y-%m') as month,
                basic_salary,
                hra,
                special_allowance,
                other_allowances,
                income_tax,
                provident_fund,
                health_insurance,
                net_salary
            FROM salary_details
            WHERE employee_id = ?
            ORDER BY effective_from DESC
            LIMIT 6
        `, [id]);
        
        res.status(200).json({
            success: true,
            data: {
                employee_info: salaryDetails[0] || {},
                current_salary: {
                    basic_salary: salaryDetails[0]?.basic_salary || 0,
                    hra: salaryDetails[0]?.hra || 0,
                    special_allowance: salaryDetails[0]?.special_allowance || 0,
                    other_allowances: salaryDetails[0]?.other_allowances || 0,
                    gross_salary: (salaryDetails[0]?.basic_salary || 0) + 
                                 (salaryDetails[0]?.hra || 0) + 
                                 (salaryDetails[0]?.special_allowance || 0) + 
                                 (salaryDetails[0]?.other_allowances || 0),
                    deductions: (salaryDetails[0]?.income_tax || 0) + 
                               (salaryDetails[0]?.provident_fund || 0) + 
                               (salaryDetails[0]?.health_insurance || 0) + 
                               (salaryDetails[0]?.professional_tax || 0),
                    net_salary: salaryDetails[0]?.net_salary || 0
                },
                leave_balance: leaveBalance[0] || {
                    annual_leave: 12,
                    sick_leave: 12,
                    casual_leave: 6,
                    unpaid_leave: 0
                },
                attendance: attendanceSummary[0] || {
                    total_days: 0,
                    present_days: 0,
                    absent_days: 0,
                    late_days: 0,
                    half_days: 0
                },
                payroll_history: payrollHistory
            }
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch employee dashboard data",
            error: err.message
        });
    }
};