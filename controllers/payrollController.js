const db = require("../config/db");

// ============================================
// CREATE PAYROLL BATCH
// ============================================
exports.createPayrollBatch = async (req, res) => {
    const { branch_id, month, year, organization_id } = req.body;
    console.log('organization_id',organization_id)

    try {
        // Check if batch already exists
        const [existing] = await db.query(
            `SELECT * FROM payroll_batches 
             WHERE organization_id = ? AND branch_id = ? AND month = ? AND year = ? 
             AND status NOT IN ('completed', 'cancelled')`,
            [organization_id, branch_id, month, year]
        );

        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Payroll batch already exists for this branch and month' 
            });
        }

        // Create new batch
        const [batchResult] = await db.query(
            `INSERT INTO payroll_batches 
             (organization_id, branch_id, month, year, status, processed_by) 
             VALUES (?, ?, ?, ?, 'compensation_review', ?)`,
            [organization_id, branch_id, month, year, req.user.id]
        );

        const batchId = batchResult.insertId;

        // Get all employees in the branch
        const [employees] = await db.query(
`SELECT 
        e.id,
        u.name,
        e.employee_code,

        COALESCE(sd.basic_salary,0) as basic_salary,
        COALESCE(sd.hra,0) as hra,
        COALESCE(sd.da,0) as da,
        COALESCE(sd.other_allowances,0) as other_allowances,
        COALESCE(sd.special_allowance,0) as special_allowance,

        COALESCE(sd.income_tax,0) as income_tax,
        COALESCE(sd.provident_fund,0) as provident_fund,
        COALESCE(sd.health_insurance,0) as health_insurance,
        COALESCE(sd.professional_tax,0) as professional_tax

FROM employees e

JOIN users u
ON e.user_id = u.id

LEFT JOIN salary_structures sd
ON e.id = sd.employee_id

WHERE e.organization_id = ?
AND e.branch_id = ?
AND e.status='active'`,
[organization_id, branch_id]
);

console.log('emp',employees)

        // Add each employee to payroll batch
       for (const emp of employees) {

    const basicSalary = Number(emp.basic_salary || 0);
    const hra = Number(emp.hra || 0);
    const da = Number(emp.da || 0);
    const otherAllowances = Number(emp.other_allowances || 0);
    const specialAllowance = Number(emp.special_allowance || 0);

    const incomeTax = Number(emp.income_tax || 0);
    const providentFund = Number(emp.provident_fund || 0);
    const healthInsurance = Number(emp.health_insurance || 0);
    const professionalTax = Number(emp.professional_tax || 0);

    const grossSalary =
        basicSalary +
        hra +
        da +
        otherAllowances +
        specialAllowance;

    const totalDeductions =
        incomeTax +
        providentFund +
        healthInsurance +
        professionalTax;

    const netSalary =
        grossSalary - totalDeductions;

    await db.query(
        `INSERT INTO payroll_employees
        (
            payroll_batch_id,
            employee_id,
            basic_salary,
            hra,
            da,
            other_allowances,
            special_allowance,
            gross_salary,
            income_tax,
            provident_fund,
            health_insurance,
            professional_tax,
            total_deductions,
            net_salary,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
            batchId,
            emp.id,
            basicSalary,
            hra,
            da,
            otherAllowances,
            specialAllowance,
            grossSalary,
            incomeTax,
            providentFund,
            healthInsurance,
            professionalTax,
            totalDeductions,
            netSalary
        ]
    );
}
        // Log step
        await db.query(
            `INSERT INTO payroll_step_logs (payroll_batch_id, step_number, step_name, action, performed_by)
             VALUES (?, 1, 'Compensation Review', 'started', ?)`,
            [batchId, req.user.id]
        );

        res.json({
            success: true,
            message: 'Payroll batch created successfully',
            batchId: batchId,
            employeeCount: employees.length
        });

    } catch (error) {
        console.error('Error creating payroll batch:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// GET PAYROLL BATCHES
// ============================================
exports.getPayrollBatches = async (req, res) => {
    const organization_id = 1;
    console.log('org',organization_id)
    try {
        const [batches] = await db.query(
            `SELECT pb.*, b.branch_name as branch_name,
                    COUNT(pe.id) as total_employees,
                    SUM(CASE WHEN pe.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
                    SUM(CASE WHEN pe.status = 'paid' THEN 1 ELSE 0 END) as paid_count
             FROM payroll_batches pb
             JOIN branches b ON pb.branch_id = b.id
             LEFT JOIN payroll_employees pe ON pb.id = pe.payroll_batch_id
             WHERE pb.organization_id = ?
             GROUP BY pb.id
             ORDER BY pb.year DESC, pb.id DESC`,
            [organization_id]
        );

        res.json({ success: true, data: batches });
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// GET PAYROLL BATCH DETAILS
// ============================================
exports.getPayrollBatchDetails = async (req, res) => {
    const { batchId } = req.params;

    try {
        // Get batch info
        const [batch] = await db.query(
            `SELECT pb.*, b.branch_name as branch_name,
                    CONCAT(u.first_name, ' ', u.last_name) as processed_by_name
             FROM payroll_batches pb
             JOIN branches b ON pb.branch_id = b.id
             LEFT JOIN users u ON pb.processed_by = u.id
             WHERE pb.id = ?`,
            [batchId]
        );

        if (batch.length === 0) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }

        const [employees] = await db.query(
`SELECT 
        pe.*,

        u.name as employee_name,

        e.employee_code,

        des.name as designation_name,

        d.name as department_name

FROM payroll_employees pe

JOIN employees e
ON pe.employee_id = e.id

JOIN users u
ON e.user_id = u.id

LEFT JOIN departments d
ON e.department_id = d.id

LEFT JOIN designations des
ON e.designation_id = des.id

WHERE pe.payroll_batch_id = ?

ORDER BY u.name`,
[batchId]
);

        // Get step logs
        const [logs] = await db.query(
            `SELECT * FROM payroll_step_logs 
             WHERE payroll_batch_id = ? 
             ORDER BY created_at`,
            [batchId]
        );

        res.json({
            success: true,
            data: {
                batch: batch[0],
                employees: employees,
                logs: logs
            }
        });
    } catch (error) {
        console.error('Error fetching batch details:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// GET PAYROLL STEP DATA
// ============================================
exports.getPayrollStepData = async (req, res) => {
    const { batchId, stepNumber } = req.params;

    try {
        const [batch] = await db.query(
            'SELECT * FROM payroll_batches WHERE id = ?',
            [batchId]
        );

        if (batch.length === 0) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }

        let data = {};
        let employees = [];

        switch (parseInt(stepNumber)) {
            case 1: // Compensation
                [employees] = await db.query(
                    `SELECT pe.*, 
                            CONCAT(e.first_name, ' ', e.last_name) as employee_name,
                            e.employee_code, e.joining_date,
                            d.name as department_name,
                            des.name as designation_name
                     FROM payroll_employees pe
                     JOIN employees e ON pe.employee_id = e.id
                     LEFT JOIN departments d ON e.department_id = d.id
                     LEFT JOIN designations des ON e.designation_id = des.id
                     WHERE pe.payroll_batch_id = ?
                     ORDER BY e.first_name`,
                    [batchId]
                );
                data = { employees, step_name: 'Compensation Review' };
                break;

            case 2: // Time & Attendance with detailed data
                [employees] = await db.query(
                    `SELECT 
                        pe.*,
                        u.name as employee_name,
                        e.employee_code,
                        e.id as employee_id,
                        
                        -- Attendance Summary
                        COALESCE(a.total_working_days, 28) as total_working_days,
                        COALESCE(a.present_days, 0) as present_days,
                        COALESCE(a.absent_days, 0) as absent_days,
                        
                        -- Late IN details
                        COALESCE(a.late_days, 0) as late_days,
                        COALESCE(a.late_deducted_hours, 0) as late_deducted_hours,
                        
                        -- Early OUT details  
                        COALESCE(a.early_out_days, 0) as early_out_days,
                        COALESCE(a.early_out_deducted_hours, 0) as early_out_deducted_hours,
                        
                        -- Total days deducted from attendance
                        COALESCE(a.total_days_deducted, 0) as total_days_deducted,
                        
                        -- LOP (Loss of Pay)
                        COALESCE(a.lop_days, 0) as attendance_lop_days,
                        COALESCE(a.lop_amount, 0) as attendance_lop_amount,
                        
                        -- Overtime
                        COALESCE(a.overtime_days, 0) as overtime_days,
                        COALESCE(a.overtime_hours, 0) as overtime_hours,
                        COALESCE(a.overtime_amount, 0) as overtime_amount,
                        
                        -- Daily wage rate for calculations
                        ROUND(pe.gross_salary / 30, 2) as daily_wage_rate
                        
                    FROM payroll_employees pe
                    JOIN employees e ON pe.employee_id = e.id
                    JOIN users u ON e.user_id = u.id
                    LEFT JOIN attendance_details a ON e.id = a.employee_id 
                        AND a.month = ? AND a.year = ?
                    WHERE pe.payroll_batch_id = ?`,
                    [batch[0].month, batch[0].year, batchId]
                );
                
                data = { 
                    employees, 
                    step_name: 'Time & Attendance Review',
                    month: batch[0].month,
                    year: batch[0].year
                };
                break;
                case 3: // IT Declarations
    try {

        // Check table exists
        const [tableExists] = await db.query(
            `SELECT COUNT(*) as count
             FROM information_schema.tables
             WHERE table_schema = DATABASE()
             AND table_name = 'it_declarations'`
        );

        if (tableExists[0].count === 0) {

            // IT table not found
            [employees] = await db.query(
                `SELECT 
                        pe.*,

                        CONCAT(
                            COALESCE(u.first_name,''),
                            ' ',
                            COALESCE(u.last_name,'')
                        ) as employee_name,

                        e.employee_code,

                        0 as investment_amount,
                        0 as hra_exemption,
                        0 as other_deductions,

                        'pending' as verification_status

                FROM payroll_employees pe

                JOIN employees e
                    ON pe.employee_id = e.id

                LEFT JOIN users u
                    ON e.user_id = u.id

                WHERE pe.payroll_batch_id = ?`,
                [batchId]
            );

        } else {

            // IT table exists
            [employees] = await db.query(
                `SELECT 
                        pe.*,

                        CONCAT(
                            COALESCE(u.first_name,''),
                            ' ',
                            COALESCE(u.last_name,'')
                        ) as employee_name,

                        e.employee_code,

                        COALESCE(itd.investment_amount,0)
                            as investment_amount,

                        COALESCE(itd.hra_exemption,0)
                            as hra_exemption,

                        COALESCE(itd.other_deductions,0)
                            as other_deductions,

                        COALESCE(
                            itd.verification_status,
                            'pending'
                        ) as verification_status

                FROM payroll_employees pe

                JOIN employees e
                    ON pe.employee_id = e.id

                LEFT JOIN users u
                    ON e.user_id = u.id

                LEFT JOIN it_declarations itd
                    ON e.id = itd.employee_id
                    AND itd.financial_year = ?

                WHERE pe.payroll_batch_id = ?`,
                [
                    batch[0].year,
                    batchId
                ]
            );

        }

        data = {
            employees,
            step_name: 'IT Declarations Review',
            financial_year: batch[0].year
        };

    } catch (error) {

        console.error(
            'Error in IT declarations step:',
            error
        );

        // fallback
        [employees] = await db.query(
            `SELECT 
                    pe.*,

                    CONCAT(
                        COALESCE(u.first_name,''),
                        ' ',
                        COALESCE(u.last_name,'')
                    ) as employee_name,

                    e.employee_code,

                    0 as investment_amount,
                    0 as hra_exemption,
                    0 as other_deductions,

                    'pending'
                    as verification_status

            FROM payroll_employees pe

            JOIN employees e
                ON pe.employee_id = e.id

            LEFT JOIN users u
                ON e.user_id = u.id

            WHERE pe.payroll_batch_id = ?`,
            [batchId]
        );

        data = {
            employees,
            step_name:
                'IT Declarations Review',

            financial_year:
                batch[0].year,

            note:
                'IT declarations table not found. Please add declarations manually.'
        };

    }

    break;
        
                try {
                    // Check if leave_balances table exists
                    const [tableExists] = await db.query(
                        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'leave_balances'"
                    );
                    
                    if (tableExists[0].count === 0) {
                        [employees] = await db.query(
                            `SELECT pe.*, 
                                    u.name as employee_name,
                                    e.employee_code,
                                    0 as leave_balance,
                                    0 as leave_encashable,
                                    0 as lop_days,
                                    0 as leave_applied,
                                    28 as total_working_days
                             FROM payroll_employees pe
                             JOIN employees e ON pe.employee_id = e.id
                             JOIN users u ON e.user_id = u.id
                             WHERE pe.payroll_batch_id = ?`,
                            [batchId]
                        );
                    } else {
                        [employees] = await db.query(
                            `SELECT pe.*, 
                                    u.name as employee_name,
                                    e.employee_code,
                                    COALESCE(l.leave_balance, 0) as leave_balance,
                                    COALESCE(l.leave_encashable, 0) as leave_encashable,
                                    COALESCE(l.lop_days, pe.lop_days, 0) as lop_days,
                                    COALESCE(l.leave_applied, 0) as leave_applied,
                                    28 as total_working_days
                             FROM payroll_employees pe
                             JOIN employees e ON pe.employee_id = e.id
                             JOIN users u ON e.user_id = u.id
                             LEFT JOIN leave_balances l ON e.id = l.employee_id 
                                AND l.year = ?
                             WHERE pe.payroll_batch_id = ?`,
                            [batch[0].year, batchId]
                        );
                    }
                    
                    // Calculate encashment amount for each employee
                    employees = employees.map(emp => {
                        const dailyWage = emp.gross_salary / 30;
                        const encashmentAmount = (emp.leave_encashable || 0) * dailyWage;
                        return {
                            ...emp,
                            daily_wage_rate: dailyWage,
                            encashment_amount: encashmentAmount
                        };
                    });
                    
                    data = { 
                        employees, 
                        step_name: 'Leave Encashment Review',
                        year: batch[0].year,
                        total_employees: employees.length,
                        total_encashable_leaves: employees.reduce((sum, emp) => sum + (emp.leave_encashable || 0), 0),
                        total_encashment_amount: employees.reduce((sum, emp) => sum + emp.encashment_amount, 0)
                    };
                } catch (error) {
                    console.error('Error in leave encashment step:', error);
                    // Fallback
                    [employees] = await db.query(
                        `SELECT pe.*, 
                                u.name as employee_name,
                                e.employee_code,
                                0 as leave_balance,
                                0 as leave_encashable,
                                pe.lop_days as lop_days,
                                0 as leave_applied,
                                28 as total_working_days
                         FROM payroll_employees pe
                         JOIN employees e ON pe.employee_id = e.id
                         JOIN users u ON e.user_id = u.id
                         WHERE pe.payroll_batch_id = ?`,
                        [batchId]
                    );
                    
                    employees = employees.map(emp => ({
                        ...emp,
                        daily_wage_rate: emp.gross_salary / 30,
                        encashment_amount: 0
                    }));
                    
                    data = { 
                        employees, 
                        step_name: 'Leave Encashment Review',
                        year: batch[0].year,
                        note: 'Leave balances table not found. Please configure leave policies.'
                    };
                }
                break;

                case 4: // Leave Encashment
    try {
        // Check if leave_balances table exists
        const [tableExists] = await db.query(
            "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'leave_balances'"
        );
        
        if (tableExists[0].count === 0) {
            // Fallback if table doesn't exist
            [employees] = await db.query(
                `SELECT pe.*, 
                        u.name as employee_name,
                        e.employee_code,
                        0 as casual_used, 0 as casual_total,
                        0 as sick_used, 0 as sick_total,
                        0 as annual_used, 0 as annual_total,
                        0 as total_leave_balance,
                        0 as leave_encashable,
                        0 as leave_encashment_amount,
                        0 as lop_days,
                        0 as leave_applied,
                        28 as total_working_days
                 FROM payroll_employees pe
                 JOIN employees e ON pe.employee_id = e.id
                 JOIN users u ON e.user_id = u.id
                 WHERE pe.payroll_batch_id = ?`,
                [batchId]
            );
        } else {
            // Query with actual table structure
            [employees] = await db.query(
                `SELECT pe.*, 
                        u.name as employee_name,
                        e.employee_code,
                        
                        -- Leave balances from your table
                        COALESCE(lb.casual_used, 0) as casual_used,
                        COALESCE(lb.casual_total, 0) as casual_total,
                        COALESCE(lb.sick_used, 0) as sick_used,
                        COALESCE(lb.sick_total, 0) as sick_total,
                        COALESCE(lb.annual_used, 0) as annual_used,
                        COALESCE(lb.annual_total, 0) as annual_total,
                        COALESCE(lb.year, ?) as leave_year,
                        
                        -- Calculate remaining balances
                        (COALESCE(lb.casual_total, 0) - COALESCE(lb.casual_used, 0)) as casual_remaining,
                        (COALESCE(lb.sick_total, 0) - COALESCE(lb.sick_used, 0)) as sick_remaining,
                        (COALESCE(lb.annual_total, 0) - COALESCE(lb.annual_used, 0)) as annual_remaining,
                        
                        -- Total leave balance (annual leaves are usually encashable)
                        (COALESCE(lb.annual_total, 0) - COALESCE(lb.annual_used, 0)) as leave_encashable,
                        
                        -- LOP days (from attendance or leave balance)
                        COALESCE(pe.lop_days, 0) as lop_days,
                        
                        28 as total_working_days
                        
                 FROM payroll_employees pe
                 JOIN employees e ON pe.employee_id = e.id
                 JOIN users u ON e.user_id = u.id
                 LEFT JOIN leave_balances lb ON e.user_id = lb.user_id 
                    AND (lb.year = ? OR lb.year IS NULL)
                 WHERE pe.payroll_batch_id = ?`,
                [batch[0].year, batch[0].year, batchId]
            );
        }
        
        // Calculate encashment amount for each employee
        employees = employees.map(emp => {
            const dailyWage = emp.gross_salary / 30;
            // Only annual leaves are usually encashable (up to a limit of 30 days typically)
            const encashableLeaves = Math.min(emp.leave_encashable || 0, 30);
            const encashmentAmount = encashableLeaves * dailyWage;
            
            return {
                ...emp,
                daily_wage_rate: dailyWage,
                encashable_leaves: encashableLeaves,
                encashment_amount: encashmentAmount
            };
        });
        
        // Calculate totals
        const totalEncashableLeaves = employees.reduce((sum, emp) => sum + (emp.encashable_leaves || 0), 0);
        const totalEncashmentAmount = employees.reduce((sum, emp) => sum + (emp.encashment_amount || 0), 0);
        const totalEmployees = employees.length;
        const approvedCount = employees.filter(emp => emp.step4_leave_approved).length;
        
        data = { 
            employees, 
            step_name: 'Leave Encashment Review',
            year: batch[0].year,
            summary: {
                total_employees: totalEmployees,
                total_encashable_leaves: totalEncashableLeaves,
                total_encashment_amount: totalEncashmentAmount,
                approved_count: approvedCount,
                pending_count: totalEmployees - approvedCount
            }
        };
        
    } catch (error) {
        console.error('Error in leave encashment step:', error);
        // Fallback query
        [employees] = await db.query(
            `SELECT pe.*, 
                    u.name as employee_name,
                    e.employee_code,
                    0 as casual_used, 0 as casual_total,
                    0 as sick_used, 0 as sick_total,
                    0 as annual_used, 0 as annual_total,
                    0 as total_leave_balance,
                    0 as leave_encashable,
                    0 as leave_encashment_amount,
                    pe.lop_days as lop_days,
                    0 as leave_applied,
                    28 as total_working_days
             FROM payroll_employees pe
             JOIN employees e ON pe.employee_id = e.id
             JOIN users u ON e.user_id = u.id
             WHERE pe.payroll_batch_id = ?`,
            [batchId]
        );
        
        employees = employees.map(emp => ({
            ...emp,
            daily_wage_rate: emp.gross_salary / 30,
            encashable_leaves: 0,
            encashment_amount: 0
        }));
        
        data = { 
            employees, 
            step_name: 'Leave Encashment Review',
            year: batch[0].year,
            summary: {
                total_employees: employees.length,
                total_encashable_leaves: 0,
                total_encashment_amount: 0,
                approved_count: 0,
                pending_count: employees.length
            },
            note: 'Leave balances loaded successfully'
        };
    }
    break;
  case 5: // Final Review
    [employees] = await db.query(
        `SELECT 
            pe.*,
            u.name as employee_name,
            e.employee_code, 
            e.pan_number,
            e.joining_date,
            d.name as department_name,
            des.name as designation_name,
            
            -- Bank details from salary_structures table
            COALESCE(sd.bank_name, 'Not Provided') as bank_name,
            COALESCE(sd.account_number, 'Not Provided') as bank_account_no,
            COALESCE(sd.ifsc_code, 'Not Provided') as ifsc_code,
            
            -- Additional info
            e.employment_type,
            e.status as employee_status,
            e.gender,
            DATE_FORMAT(e.joining_date, '%d %b, %Y') as formatted_joining_date
            
        FROM payroll_employees pe
        JOIN employees e ON pe.employee_id = e.id
        JOIN users u ON e.user_id = u.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        LEFT JOIN salary_structures sd ON e.id = sd.employee_id 
            AND sd.effective_from <= CONCAT(?, '-01-01')
            AND sd.effective_from IS NOT NULL
        WHERE pe.payroll_batch_id = ?
        GROUP BY pe.id
        ORDER BY u.name`,
        [batch[0].year, batchId]
    );
    
    // Calculate summary statistics
    const summary = {
        total_gross: employees.reduce((sum, e) => sum + parseFloat(e.gross_salary || 0), 0),
        total_deductions: employees.reduce((sum, e) => sum + parseFloat(e.total_deductions || 0), 0),
        total_net: employees.reduce((sum, e) => sum + parseFloat(e.net_salary || 0), 0),
        total_lop: employees.reduce((sum, e) => sum + parseFloat(e.loss_of_pay || 0), 0),
        total_employees: employees.length,
        employees_without_bank: employees.filter(e => !e.account_number || e.account_number === 'Not Provided').length,
        employees_without_pan: employees.filter(e => !e.pan_number).length,
        total_earnings_components: {
            basic: employees.reduce((sum, e) => sum + parseFloat(e.basic_salary || 0), 0),
            hra: employees.reduce((sum, e) => sum + parseFloat(e.hra || 0), 0),
            da: employees.reduce((sum, e) => sum + parseFloat(e.da || 0), 0),
            other_allowances: employees.reduce((sum, e) => sum + parseFloat(e.other_allowances || 0), 0),
            special_allowance: employees.reduce((sum, e) => sum + parseFloat(e.special_allowance || 0), 0)
        },
        total_deductions_components: {
            income_tax: employees.reduce((sum, e) => sum + parseFloat(e.income_tax || 0), 0),
            provident_fund: employees.reduce((sum, e) => sum + parseFloat(e.provident_fund || 0), 0),
            health_insurance: employees.reduce((sum, e) => sum + parseFloat(e.health_insurance || 0), 0),
            professional_tax: employees.reduce((sum, e) => sum + parseFloat(e.professional_tax || 0), 0)
        },
        department_breakdown: await getDepartmentBreakdown(batchId),
        bank_verification_status: {
            verified: employees.filter(e => e.account_number && e.account_number !== 'Not Provided').length,
            pending: employees.filter(e => !e.account_number || e.account_number === 'Not Provided').length
        }
    };
    
    data = { 
        employees, 
        step_name: 'Final Review',
        summary: summary
    };
    break;
}

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching step data:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// UPDATE EMPLOYEE COMPENSATION
// ============================================
exports.updateEmployeeCompensation = async (req, res) => {
    const { batchId, employeeId } = req.params;
    const { basic_salary, hra, da, other_allowances, special_allowance } = req.body;

    try {
        const grossSalary = (basic_salary || 0) + (hra || 0) + (da || 0) + 
                           (other_allowances || 0) + (special_allowance || 0);

        await db.query(
            `UPDATE payroll_employees 
             SET basic_salary = ?, hra = ?, da = ?, other_allowances = ?, 
                 special_allowance = ?, gross_salary = ?,
                 step1_compensation_approved = TRUE
             WHERE payroll_batch_id = ? AND employee_id = ?`,
            [basic_salary, hra, da, other_allowances, special_allowance, grossSalary, batchId, employeeId]
        );

        res.json({ success: true, message: 'Compensation updated successfully' });
    } catch (error) {
        console.error('Error updating compensation:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// UPDATE EMPLOYEE ATTENDANCE
// ============================================
exports.updateEmployeeAttendance = async (req, res) => {
    const { batchId, employeeId } = req.params;
    const { 
        lop_days, 
        lop_amount, 
        paid_days,
        overtime_days,
        overtime_amount,
        late_days,
        late_deducted_hours,
        early_out_days,
        early_out_deducted_hours,
        total_days_deducted
    } = req.body;

    try {
        // Update payroll_employees table
        await db.query(
            `UPDATE payroll_employees 
             SET lop_days = ?, 
                 loss_of_pay = ?,
                 paid_days = ?,
                 step2_attendance_approved = FALSE
             WHERE payroll_batch_id = ? AND employee_id = ?`,
            [lop_days || 0, lop_amount || 0, paid_days || 28, batchId, employeeId]
        );

        // Update or insert attendance details
        const [batch] = await db.query(
            'SELECT month, year FROM payroll_batches WHERE id = ?',
            [batchId]
        );

        await db.query(
            `INSERT INTO attendance_details 
             (employee_id, month, year, late_days, late_deducted_hours, 
              early_out_days, early_out_deducted_hours, total_days_deducted,
              lop_days, lop_amount, overtime_days, overtime_hours, overtime_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             late_days = VALUES(late_days),
             late_deducted_hours = VALUES(late_deducted_hours),
             early_out_days = VALUES(early_out_days),
             early_out_deducted_hours = VALUES(early_out_deducted_hours),
             total_days_deducted = VALUES(total_days_deducted),
             lop_days = VALUES(lop_days),
             lop_amount = VALUES(lop_amount),
             overtime_days = VALUES(overtime_days),
             overtime_hours = VALUES(overtime_hours),
             overtime_amount = VALUES(overtime_amount)`,
            [
                employeeId, batch[0].month, batch[0].year,
                late_days || 0, late_deducted_hours || 0,
                early_out_days || 0, early_out_deducted_hours || 0,
                total_days_deducted || 0,
                lop_days || 0, lop_amount || 0,
                overtime_days || 0, (overtime_days || 0) * 8, overtime_amount || 0
            ]
        );

        // Recalculate net salary
        const [employee] = await db.query(
            `SELECT gross_salary, total_deductions, loss_of_pay 
             FROM payroll_employees 
             WHERE payroll_batch_id = ? AND employee_id = ?`,
            [batchId, employeeId]
        );

        if (employee.length > 0) {
            const netSalary = employee[0].gross_salary - employee[0].total_deductions - (lop_amount || 0) + (req.body.overtime_amount || 0);
            await db.query(
                `UPDATE payroll_employees SET net_salary = ? 
                 WHERE payroll_batch_id = ? AND employee_id = ?`,
                [netSalary, batchId, employeeId]
            );
        }

        res.json({ success: true, message: 'Attendance updated successfully' });
    } catch (error) {
        console.error('Error updating attendance:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};


// ============================================
// UPDATE IT DECLARATION
// ============================================
exports.updateITDeclaration = async (req, res) => {
    const { batchId, employeeId } = req.params;
    const { investment_amount, hra_exemption, other_deductions, income_tax } = req.body;

    try {
        await db.query(
            `UPDATE payroll_employees 
             SET income_tax = ?, step3_it_declaration_approved = TRUE
             WHERE payroll_batch_id = ? AND employee_id = ?`,
            [income_tax, batchId, employeeId]
        );

        // Recalculate total deductions and net salary
        const [employee] = await db.query(
            `SELECT gross_salary, provident_fund, health_insurance, professional_tax, 
                    loan_deduction, income_tax, loss_of_pay
             FROM payroll_employees 
             WHERE payroll_batch_id = ? AND employee_id = ?`,
            [batchId, employeeId]
        );

        if (employee.length > 0) {
            const totalDeductions = (employee[0].provident_fund || 0) + 
                                   (employee[0].health_insurance || 0) + 
                                   (employee[0].professional_tax || 0) + 
                                   (employee[0].loan_deduction || 0) + 
                                   (income_tax || 0);
            
            const netSalary = employee[0].gross_salary - totalDeductions - (employee[0].loss_of_pay || 0);

            await db.query(
                `UPDATE payroll_employees 
                 SET total_deductions = ?, net_salary = ?
                 WHERE payroll_batch_id = ? AND employee_id = ?`,
                [totalDeductions, netSalary, batchId, employeeId]
            );
        }

        res.json({ success: true, message: 'IT Declaration updated successfully' });
    } catch (error) {
        console.error('Error updating IT declaration:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// UPDATE LEAVE ENCASHMENT
// ============================================
exports.updateLeaveEncashment = async (req, res) => {
    const { batchId, employeeId } = req.params;
    const { leave_encashment_amount, leave_balance } = req.body;

    try {
        await db.query(
            `UPDATE payroll_employees 
             SET step4_leave_approved = TRUE
             WHERE payroll_batch_id = ? AND employee_id = ?`,
            [batchId, employeeId]
        );

        res.json({ success: true, message: 'Leave encashment updated successfully' });
    } catch (error) {
        console.error('Error updating leave encashment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// APPROVE PAYROLL STEP
// ============================================
exports.approvePayrollStep = async (req, res) => {
    const { batchId, stepNumber } = req.params;
    const { remarks } = req.body;

    try {
        const stepColumns = {
              1: 'step1_compensation_approved',
              2: 'step2_attendance_approved',
              3: 'step3_it_declaration_approved',
              4: 'step4_leave_approved',
              5: 'step5_review_approved'
          };
          const stepColumn = stepColumns[stepNumber];

        const stepNames = {
            1: 'compensation_review',
            2: 'attendance_review',
            3: 'declaration_review',
            4: 'leave_review',
            5: 'final_review'
        };

        // Update all employees in batch for this step
        await db.query(
            `UPDATE payroll_employees SET ${stepColumn} = TRUE 
             WHERE payroll_batch_id = ?`,
            [batchId]
        );

        // Update batch status
        const nextStatus = stepNames[parseInt(stepNumber) + 1] || 'completed';
        await db.query(
            `UPDATE payroll_batches SET status = ? WHERE id = ?`,
            [nextStatus, batchId]
        );

        // Log the approval
        await db.query(
            `INSERT INTO payroll_step_logs 
             (payroll_batch_id, step_number, step_name, action, performed_by, remarks)
             VALUES (?, ?, ?, 'approved', ?, ?)`,
            [batchId, stepNumber, stepNames[stepNumber], req.user.id, remarks || null]
        );

        res.json({ 
            success: true, 
            message: `Step ${stepNumber} approved successfully`,
            nextStep: parseInt(stepNumber) + 1
        });
    } catch (error) {
        console.error('Error approving step:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// REJECT PAYROLL STEP
// ============================================
exports.rejectPayrollStep = async (req, res) => {
    const { batchId, stepNumber } = req.params;
    const { remarks } = req.body;

    try {
        const stepNames = {
            1: 'compensation_review',
            2: 'attendance_review',
            3: 'declaration_review',
            4: 'leave_review',
            5: 'final_review'
        };

        // Log the rejection
        await db.query(
            `INSERT INTO payroll_step_logs 
             (payroll_batch_id, step_number, step_name, action, performed_by, remarks)
             VALUES (?, ?, ?, 'rejected', ?, ?)`,
            [batchId, stepNumber, stepNames[stepNumber], req.user.id, remarks]
        );

        res.json({ 
            success: true, 
            message: `Step ${stepNumber} rejected. Please review and try again.`
        });
    } catch (error) {
        console.error('Error rejecting step:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// FINALIZE PAYROLL
// ============================================
exports.finalizePayroll = async (req, res) => {
    const { batchId } = req.params;

    try {
        // Update batch status
        await db.query(
            `UPDATE payroll_batches 
             SET status = 'completed', completed_at = NOW(),
                 total_gross = (SELECT SUM(gross_salary) FROM payroll_employees WHERE payroll_batch_id = ?),
                 total_deductions = (SELECT SUM(total_deductions) FROM payroll_employees WHERE payroll_batch_id = ?),
                 total_net = (SELECT SUM(net_salary) FROM payroll_employees WHERE payroll_batch_id = ?)
             WHERE id = ?`,
            [batchId, batchId, batchId, batchId]
        );

        // Update all employees status to 'approved'
        await db.query(
            `UPDATE payroll_employees SET status = 'approved' WHERE payroll_batch_id = ?`,
            [batchId]
        );

        // Generate payslips for all employees
        const [batch] = await db.query('SELECT month, year FROM payroll_batches WHERE id = ?', [batchId]);
        const [employees] = await db.query(
            'SELECT employee_id, net_salary FROM payroll_employees WHERE payroll_batch_id = ?',
            [batchId]
        );

        for (const emp of employees) {
            await db.query(
                `INSERT INTO payslips (employee_id, month, year, net_salary, status)
                 VALUES (?, ?, ?, ?, 'generated')
                 ON DUPLICATE KEY UPDATE net_salary = ?, status = 'generated'`,
                [emp.employee_id, batch[0].month, batch[0].year, emp.net_salary, emp.net_salary]
            );
        }

        // Log finalization
        await db.query(
            `INSERT INTO payroll_step_logs 
             (payroll_batch_id, step_number, step_name, action, performed_by, remarks)
             VALUES (?, 5, 'Final Review', 'finalized', ?, 'Payroll completed successfully')`,
            [batchId, req.user.id]
        );

        res.json({ 
            success: true, 
            message: 'Payroll finalized successfully! Payslips have been generated.'
        });
    } catch (error) {
        console.error('Error finalizing payroll:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// DOWNLOAD PAYROLL REPORT
// ============================================
exports.downloadPayrollReport = async (req, res) => {
    const { batchId } = req.params;

    try {
        const [employees] = await db.query(
            `SELECT pe.*, 
                    CONCAT(e.first_name, ' ', e.last_name) as employee_name,
                    e.employee_code, e.pan_number, e.bank_account_no,
                    d.name as department_name
             FROM payroll_employees pe
             JOIN employees e ON pe.employee_id = e.id
             LEFT JOIN departments d ON e.department_id = d.id
             WHERE pe.payroll_batch_id = ?
             ORDER BY e.first_name`,
            [batchId]
        );

        // Generate CSV report
        const csvHeaders = ['Employee Code', 'Employee Name', 'Department', 'Basic', 'HRA', 'DA', 
                           'Other Allowances', 'Gross Salary', 'Income Tax', 'PF', 'Health Insurance',
                           'Professional Tax', 'Total Deductions', 'Loss of Pay', 'Net Salary', 'Status'];
        
        const csvRows = employees.map(emp => [
            emp.employee_code,
            emp.employee_name,
            emp.department_name || 'N/A',
            emp.basic_salary || 0,
            emp.hra || 0,
            emp.da || 0,
            emp.other_allowances || 0,
            emp.gross_salary || 0,
            emp.income_tax || 0,
            emp.provident_fund || 0,
            emp.health_insurance || 0,
            emp.professional_tax || 0,
            emp.total_deductions || 0,
            emp.loss_of_pay || 0,
            emp.net_salary || 0,
            emp.status
        ]);

        const csvContent = [csvHeaders, ...csvRows].map(row => row.join(',')).join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=payroll_batch_${batchId}.csv`);
        res.send(csvContent);
    } catch (error) {
        console.error('Error downloading report:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};