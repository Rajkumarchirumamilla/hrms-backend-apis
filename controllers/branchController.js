const db = require('../config/db');

const branchController = {
    // Create a new branch
    createBranch: async (req, res) => {
        try {
            const {
                branch_code,
                branch_name,
                email,
                phone,
                address,
                city,
                state,
                country,
                postal_code,
                website,
                branch_manager_id,
                status = 'active'
            } = req.body;
            
            const organization_id = req.user.organization_id;
            
            // Validate required fields
            if (!branch_code || !branch_name) {
                return res.status(400).json({
                    success: false,
                    message: 'branch_code and branch_name are required fields'
                });
            }
            
            // Check if branch code already exists
            const [existingBranch] = await db.query(
                'SELECT id FROM branches WHERE organization_id = ? AND (branch_code = ? OR branch_name = ?)',
                [organization_id, branch_code, branch_name]
            );
            
            if (existingBranch.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Branch code or branch name already exists for this organization'
                });
            }
            
            // Insert branch
            const [result] = await db.query(
                `INSERT INTO branches (
                    organization_id, branch_code, branch_name, email, phone, 
                    address, city, state, country, postal_code, website, 
                    branch_manager_id, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    organization_id, branch_code, branch_name, email || null, phone || null,
                    address || null, city || null, state || null, country || null, 
                    postal_code || null, website || null, branch_manager_id || null, status
                ]
            );
            
            // Fetch created branch
            const [newBranch] = await db.query(
                `SELECT b.*, 
                    CONCAT(e.first_name, ' ', e.last_name) as manager_name
                FROM branches b
                LEFT JOIN employees e ON b.branch_manager_id = e.id
                WHERE b.id = ?`,
                [result.insertId]
            );
            
            res.status(201).json({
                success: true,
                message: 'Branch created successfully',
                data: newBranch[0]
            });
            
        } catch (error) {
            console.error('Error creating branch:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    },
    
    // Get all branches for an organization
    getAllBranches: async (req, res) => {
    try {
        const organization_id = req.params.organization_id;
        const { status, page = 1, limit = 10 } = req.query;

        let query = `
            SELECT 
                b.*,

                COUNT(DISTINCT e.id) AS total_employees,

                u.name AS manager_name,

                u.email AS manager_email,

                u.mobilenumber AS manager_mobile

            FROM branches b

            LEFT JOIN employees e
                ON b.id = e.branch_id
                AND e.status = 'active'

            LEFT JOIN employees emp
                ON b.branch_manager_id = emp.id

            LEFT JOIN users u
                ON emp.user_id = u.id

            WHERE b.organization_id = ?
        `;

        const queryParams = [organization_id];

        if (status) {
            query += ` AND b.status = ?`;
            queryParams.push(status);
        }

        query += `
            GROUP BY 
                b.id,
                u.name,
                u.email,
                u.mobilenumber

            ORDER BY b.created_at DESC
        `;

        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);

        query += ` LIMIT ? OFFSET ?`;

        queryParams.push(
            parseInt(limit),
            parseInt(offset)
        );

        const [branches] = await db.query(
            query,
            queryParams
        );

        // Total count
        let countQuery = `
            SELECT COUNT(*) AS total
            FROM branches
            WHERE organization_id = ?
        `;

        const countParams = [organization_id];

        if (status) {
            countQuery += ` AND status = ?`;
            countParams.push(status);
        }

        const [countResult] = await db.query(
            countQuery,
            countParams
        );

        return res.status(200).json({
            success: true,

            data: branches,

            pagination: {
                current_page: parseInt(page),

                total_pages: Math.ceil(
                    countResult[0].total /
                    parseInt(limit)
                ),

                total_items: countResult[0].total,

                items_per_page: parseInt(limit)
            }
        });

    } catch (error) {

        console.error(
            "Error fetching branches:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
},
    
    // Get branch by ID with employees
    getBranchById: async (req, res) => {
        try {
            const { id } = req.params;
            const organization_id = req.user.organization_id;
            
            // Get branch details
            const [branches] = await db.query(
                `SELECT 
                    b.*,
                    CONCAT(emp.first_name, ' ', emp.last_name) as manager_name,
                    emp.email as manager_email,
                    emp.phone as manager_phone
                FROM branches b
                LEFT JOIN employees emp ON b.branch_manager_id = emp.id
                WHERE b.id = ? AND b.organization_id = ?`,
                [id, organization_id]
            );
            
            if (branches.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Branch not found'
                });
            }
            
            // Get employees in this branch
            const [employees] = await db.query(
                `SELECT 
                    id, employee_code, first_name, last_name, 
                    email, phone, position, department_id, 
                    joining_date, status
                FROM employees 
                WHERE branch_id = ? AND organization_id = ?
                ORDER BY first_name`,
                [id, organization_id]
            );
            
            res.status(200).json({
                success: true,
                data: {
                    ...branches[0],
                    employees: employees,
                    total_employees: employees.length
                }
            });
            
        } catch (error) {
            console.error('Error fetching branch:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    },
    
    // Update branch
    updateBranch: async (req, res) => {
        try {
            const { id } = req.params;
            const organization_id = req.user.organization_id;
            const updateFields = req.body;
            
            // Check if branch exists
            const [branch] = await db.query(
                'SELECT id FROM branches WHERE id = ? AND organization_id = ?',
                [id, organization_id]
            );
            
            if (branch.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Branch not found'
                });
            }
            
            // Build update query dynamically
            const allowedFields = [
                'branch_code', 'branch_name', 'email', 'phone', 'address',
                'city', 'state', 'country', 'postal_code', 'website', 
                'branch_manager_id', 'status'
            ];
            
            const updates = [];
            const values = [];
            
            for (const field of allowedFields) {
                if (updateFields[field] !== undefined) {
                    updates.push(`${field} = ?`);
                    values.push(updateFields[field]);
                }
            }
            
            if (updates.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No fields to update'
                });
            }
            
            // Check unique constraints if updating code or name
            if (updateFields.branch_code || updateFields.branch_name) {
                const [existing] = await db.query(
                    `SELECT id FROM branches 
                    WHERE organization_id = ? 
                    AND (branch_code = ? OR branch_name = ?)
                    AND id != ?`,
                    [
                        organization_id, 
                        updateFields.branch_code || branch[0].branch_code,
                        updateFields.branch_name || branch[0].branch_name,
                        id
                    ]
                );
                
                if (existing.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Branch code or name already exists'
                    });
                }
            }
            
            values.push(id, organization_id);
            await db.query(
                `UPDATE branches SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
                values
            );
            
            // Get updated branch
            const [updatedBranch] = await db.query(
                `SELECT b.*, CONCAT(e.first_name, ' ', e.last_name) as manager_name
                FROM branches b
                LEFT JOIN employees e ON b.branch_manager_id = e.id
                WHERE b.id = ?`,
                [id]
            );
            
            res.status(200).json({
                success: true,
                message: 'Branch updated successfully',
                data: updatedBranch[0]
            });
            
        } catch (error) {
            console.error('Error updating branch:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    },
    
    // Delete branch (soft delete)
    deleteBranch: async (req, res) => {
        try {
            const { id } = req.params;
            const organization_id = req.user.organization_id;
            
            // Check if branch exists
            const [branch] = await db.query(
                'SELECT id, branch_name FROM branches WHERE id = ? AND organization_id = ?',
                [id, organization_id]
            );
            
            if (branch.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Branch not found'
                });
            }
            
            // Check if branch has employees
            const [employees] = await db.query(
                'SELECT COUNT(*) as count FROM employees WHERE branch_id = ?',
                [id]
            );
            
            if (employees[0].count > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot delete branch with ${employees[0].count} employees. Please reassign or transfer employees first.`
                });
            }
            
            // Soft delete - update status to inactive
            await db.query(
                'UPDATE branches SET status = ? WHERE id = ?',
                ['inactive', id]
            );
            
            res.status(200).json({
                success: true,
                message: `Branch "${branch[0].branch_name}" deleted successfully`
            });
            
        } catch (error) {
            console.error('Error deleting branch:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    },
    
    // Update branch status
    updateBranchStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const organization_id = req.user.organization_id;
            
            if (!['active', 'inactive'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Must be "active" or "inactive"'
                });
            }
            
            const [result] = await db.query(
                'UPDATE branches SET status = ? WHERE id = ? AND organization_id = ?',
                [status, id, organization_id]
            );
            
            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Branch not found'
                });
            }
            
            res.status(200).json({
                success: true,
                message: `Branch ${status === 'active' ? 'activated' : 'deactivated'} successfully`
            });
            
        } catch (error) {
            console.error('Error updating branch status:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    },
    
    // Get employees by branch
    getEmployeesByBranch: async (req, res) => {
        try {
            const { branchId } = req.params;
            const organization_id = req.user.organization_id;
            const { status = 'active', page = 1, limit = 10 } = req.query;
            
            // Check if branch exists
            const [branch] = await db.query(
                'SELECT id, branch_name FROM branches WHERE id = ? AND organization_id = ?',
                [branchId, organization_id]
            );
            
            if (branch.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Branch not found'
                });
            }
            
            let query = `
                SELECT 
                    e.id, e.employee_code, e.first_name, e.last_name, 
                    e.email, e.phone, e.position, e.department_id,
                    e.joining_date, e.status, e.created_at
                FROM employees e
                WHERE e.branch_id = ? AND e.organization_id = ?
            `;
            
            const queryParams = [branchId, organization_id];
            
            if (status !== 'all') {
                query += ' AND e.status = ?';
                queryParams.push(status);
            }
            
            query += ' ORDER BY e.first_name';
            
            // Add pagination
            const offset = (page - 1) * limit;
            query += ' LIMIT ? OFFSET ?';
            queryParams.push(parseInt(limit), parseInt(offset));
            
            const [employees] = await db.query(query, queryParams);
            
            // Get total count
            let countQuery = `
                SELECT COUNT(*) as total 
                FROM employees e
                WHERE e.branch_id = ? AND e.organization_id = ?
            `;
            const countParams = [branchId, organization_id];
            
            if (status !== 'all') {
                countQuery += ' AND e.status = ?';
                countParams.push(status);
            }
            
            const [totalCount] = await db.query(countQuery, countParams);
            
            res.status(200).json({
                success: true,
                data: {
                    branch: branch[0],
                    employees: employees,
                    pagination: {
                        current_page: parseInt(page),
                        total_pages: Math.ceil(totalCount[0].total / limit),
                        total_items: totalCount[0].total,
                        items_per_page: parseInt(limit)
                    }
                }
            });
            
        } catch (error) {
            console.error('Error fetching branch employees:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    },
    
    // Assign employee to branch
    assignEmployeeBranch: async (req, res) => {
        try {
            const { employeeId } = req.params;
            const { branch_id } = req.body; 
            const organization_id = req.user.organization_id;
            
            // Check if employee exists
            const [employee] = await db.query(
                'SELECT id, first_name, last_name, employee_code FROM employees WHERE id = ? AND organization_id = ?',
                [employeeId, organization_id]
            );
            
            if (employee.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Employee not found'
                });
            }
            
            // If branch_id provided, check if branch exists and is active
            if (branch_id) {
                const [branch] = await db.query(
                    'SELECT id, branch_name FROM branches WHERE id = ? AND organization_id = ? AND status = "active"',
                    [branch_id, organization_id]
                );
                
                if (branch.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'Branch not found or inactive'
                    });
                }
                
                // Update employee's branch
                await db.query(
                    'UPDATE employees SET branch_id = ? WHERE id = ?',
                    [branch_id, employeeId]
                );
                
                res.status(200).json({
                    success: true,
                    message: `Employee ${employee[0].first_name} ${employee[0].last_name} assigned to ${branch[0].branch_name} successfully`
                });
                
            } else {
                // Remove employee from branch
                await db.query(
                    'UPDATE employees SET branch_id = NULL WHERE id = ?',
                    [employeeId]
                );
                
                res.status(200).json({
                    success: true,
                    message: `Employee ${employee[0].first_name} ${employee[0].last_name} removed from branch successfully`
                });
            }
            
        } catch (error) {
            console.error('Error assigning employee branch:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    },
    
    // Get branch statistics
    getBranchStatistics: async (req, res) => {
        try {
            const organization_id = req.user.organization_id;
            
            const [stats] = await db.query(`
                SELECT 
                    COUNT(DISTINCT b.id) as total_branches,
                    COUNT(DISTINCT CASE WHEN b.status = 'active' THEN b.id END) as active_branches,
                    COUNT(DISTINCT CASE WHEN b.status = 'inactive' THEN b.id END) as inactive_branches,
                    COUNT(DISTINCT e.id) as total_employees,
                    COUNT(DISTINCT CASE WHEN e.status = 'active' THEN e.id END) as active_employees,
                    COALESCE(ROUND(AVG(branch_stats.emp_count), 0), 0) as avg_employees_per_branch
                FROM branches b
                LEFT JOIN employees e ON b.id = e.branch_id
                LEFT JOIN (
                    SELECT branch_id, COUNT(*) as emp_count
                    FROM employees
                    WHERE organization_id = ?
                    GROUP BY branch_id
                ) as branch_stats ON b.id = branch_stats.branch_id
                WHERE b.organization_id = ?
            `, [organization_id, organization_id]);
            
            // Get branches with highest employee count
            const [topBranches] = await db.query(`
                SELECT 
                    b.id,
                    b.branch_name,
                    b.branch_code,
                    b.city,
                    b.status,
                    COUNT(e.id) as employee_count
                FROM branches b
                LEFT JOIN employees e ON b.id = e.branch_id AND e.status = 'active'
                WHERE b.organization_id = ? AND b.status = 'active'
                GROUP BY b.id
                ORDER BY employee_count DESC
                LIMIT 5
            `, [organization_id]);
            
            // Get branches with no employees
            const [emptyBranches] = await db.query(`
                SELECT 
                    b.id,
                    b.branch_name,
                    b.branch_code,
                    b.city,
                    b.status
                FROM branches b
                LEFT JOIN employees e ON b.id = e.branch_id
                WHERE b.organization_id = ? AND e.id IS NULL
                GROUP BY b.id
            `, [organization_id]);
            
            res.status(200).json({
                success: true,
                data: {
                    statistics: stats[0],
                    top_branches: topBranches,
                    empty_branches: emptyBranches,
                    empty_branches_count: emptyBranches.length
                }
            });
            
        } catch (error) {
            console.error('Error fetching branch statistics:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    },
    
    // Get employee count by branch
    getEmployeeCountByBranch: async (req, res) => {
        try {
            const { branchId } = req.params;
            const organization_id = req.user.organization_id;
            
            const [result] = await db.query(`
                SELECT 
                    b.id,
                    b.branch_name,
                    b.branch_code,
                    b.status,
                    COUNT(e.id) as total_employees,
                    COUNT(CASE WHEN e.status = 'active' THEN 1 END) as active_employees,
                    COUNT(CASE WHEN e.status = 'inactive' THEN 1 END) as inactive_employees,
                    GROUP_CONCAT(DISTINCT e.department_id) as department_ids
                FROM branches b
                LEFT JOIN employees e ON b.id = e.branch_id
                WHERE b.id = ? AND b.organization_id = ?
                GROUP BY b.id
            `, [branchId, organization_id]);
            
            if (result.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Branch not found'
                });
            }
            
            res.status(200).json({
                success: true,
                data: result[0]
            });
            
        } catch (error) {
            console.error('Error fetching employee count:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
};

module.exports = branchController;