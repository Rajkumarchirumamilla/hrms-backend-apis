const db = require("../config/db");

// Add/Update salary details for an employee
exports.addOrUpdateSalary = async (req, res) => {
    try {
        const {
            employee_id,
            basic_salary,
            hra,
            da,
            special_allowance,  // Add this
            other_allowances,
            professional_tax,   // Add this
            income_tax,
            provident_fund,
            health_insurance,
            net_salary,         // Add this
            bank_name,          // Add this
            account_number,     // Add this
            ifsc_code,          // Add this
            effective_from
        } = req.body;

        // Validation
        if (!employee_id || !basic_salary || !effective_from) {
            return res.status(400).json({ 
                message: "Missing required fields: employee_id, basic_salary, effective_from" 
            });
        }

        if (basic_salary < 0) {
            return res.status(400).json({ 
                message: "Salary components cannot be negative" 
            });
        }

        // Check if employee exists
        const [[employee]] = await db.execute(
            "SELECT id FROM employees WHERE id = ?",
            [employee_id]
        );

        if (!employee) {
            return res.status(404).json({ message: "Employee not found" });
        }

        // Check if salary record exists for this employee
        const [[existing]] = await db.execute(
            "SELECT id FROM salary_details WHERE employee_id = ?",
            [employee_id]
        );

        let result;
        if (existing) {
            // Update existing record
            [result] = await db.execute(
                `UPDATE salary_details 
                 SET basic_salary = ?, 
                     hra = ?, 
                     da = ?, 
                     special_allowance = ?,
                     other_allowances = ?,
                     professional_tax = ?,
                     income_tax = ?, 
                     provident_fund = ?, 
                     health_insurance = ?,
                     net_salary = ?,
                     bank_name = ?,
                     account_number = ?,
                     ifsc_code = ?,
                     effective_from = ?
                 WHERE employee_id = ?`,
                [
                    basic_salary, 
                    hra || 0, 
                    da || 0,
                    special_allowance || 0,
                    other_allowances || 0,
                    professional_tax || 0,
                    income_tax || 0, 
                    provident_fund || 0, 
                    health_insurance || 0,
                    net_salary || 0,
                    bank_name || null,
                    account_number || null,
                    ifsc_code || null,
                    effective_from,
                    employee_id
                ]
            );
            res.json({ 
                message: "Salary details updated successfully",
                salary_id: existing.id
            });
        } else {
            // Insert new record
            [result] = await db.execute(
                `INSERT INTO salary_details 
                 (employee_id, basic_salary, hra, da, special_allowance, other_allowances,
                  professional_tax, income_tax, provident_fund, health_insurance, net_salary,
                  bank_name, account_number, ifsc_code, effective_from)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    employee_id, 
                    basic_salary, 
                    hra || 0, 
                    da || 0,
                    special_allowance || 0,
                    other_allowances || 0,
                    professional_tax || 0,
                    income_tax || 0, 
                    provident_fund || 0, 
                    health_insurance || 0,
                    net_salary || 0,
                    bank_name || null,
                    account_number || null,
                    ifsc_code || null,
                    effective_from
                ]
            );
            res.status(201).json({ 
                message: "Salary details added successfully",
                salary_id: result.insertId
            });
        }

    } catch (err) {
        console.error("Add/Update salary error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Get salary details by employee ID
exports.getSalaryByEmployeeId = async (req, res) => {
    try {
        const { employee_id } = req.params;
        
        // Check if employee exists
        const [[employee]] = await db.execute(
            "SELECT id, name, email FROM users WHERE id = ?",
            [employee_id]
        );

        if (!employee) {
            return res.status(404).json({ message: "Employee not found" });
        }

        // Get current salary (most recent based on effective_from)
        const [salaryDetails] = await db.execute(
            `SELECT * FROM salary_details 
             WHERE employee_id = ? 
             ORDER BY effective_from DESC`,
            [employee_id]
        );

        if (salaryDetails.length === 0) {
            return res.status(404).json({ 
                message: "No salary details found for this employee" 
            });
        }

        // Calculate net salary for each record
        const salaryWithNet = salaryDetails.map(salary => {
            const grossSalary = salary.basic_salary + salary.hra + salary.da + salary.other_allowances;
            const totalDeductions = salary.income_tax + salary.provident_fund + salary.health_insurance;
            const netSalary = grossSalary - totalDeductions;
            
            return {
                ...salary,
                gross_salary: grossSalary,
                total_deductions: totalDeductions,
                net_salary: netSalary
            };
        });

        res.json({
            employee: {
                id: employee.id,
                name: employee.name,
                email: employee.email
            },
            salary_details: salaryWithNet,
            current_salary: salaryWithNet[0] // Most recent salary
        });

    } catch (err) {
        console.error("Get salary error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Get all employees salary details (for HR/Admin)
exports.getAllSalaries = async (req, res) => {
    try {
        const [salaries] = await db.execute(
            `SELECT sd.*, u.name as employee_name, u.email 
             FROM salary_details sd
             JOIN users u ON sd.employee_id = u.id
             WHERE sd.effective_from = (
                 SELECT MAX(effective_from) 
                 FROM salary_details 
                 WHERE employee_id = sd.employee_id
             )
             ORDER BY u.name`
        );

        // Calculate net salary for each
        const salariesWithNet = salaries.map(salary => {
            const grossSalary = salary.basic_salary + salary.hra + salary.da + salary.other_allowances;
            const totalDeductions = salary.income_tax + salary.provident_fund + salary.health_insurance;
            const netSalary = grossSalary - totalDeductions;
            
            return {
                ...salary,
                gross_salary: grossSalary,
                total_deductions: totalDeductions,
                net_salary: netSalary
            };
        });

        res.json({
            total_employees: salariesWithNet.length,
            salaries: salariesWithNet
        });

    } catch (err) {
        console.error("Get all salaries error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Get salary history for an employee
exports.getSalaryHistory = async (req, res) => {
    try {
        const { employee_id } = req.params;
        
        const [history] = await db.execute(
            `SELECT * FROM salary_details 
             WHERE employee_id = ? 
             ORDER BY effective_from DESC`,
            [employee_id]
        );

        if (history.length === 0) {
            return res.status(404).json({ 
                message: "No salary history found for this employee" 
            });
        }

        // Calculate details for each historical record
        const historyWithCalculations = history.map(salary => {
            const grossSalary = salary.basic_salary + salary.hra + salary.da + salary.other_allowances;
            const totalDeductions = salary.income_tax + salary.provident_fund + salary.health_insurance;
            const netSalary = grossSalary - totalDeductions;
            
            return {
                ...salary,
                gross_salary: grossSalary,
                total_deductions: totalDeductions,
                net_salary: netSalary
            };
        });

        res.json({
            employee_id: parseInt(employee_id),
            total_revisions: historyWithCalculations.length,
            salary_history: historyWithCalculations
        });

    } catch (err) {
        console.error("Get salary history error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Delete salary record (Admin only)
exports.deleteSalaryRecord = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if record exists
        const [[salary]] = await db.execute(
            "SELECT id FROM salary_details WHERE id = ?",
            [id]
        );

        if (!salary) {
            return res.status(404).json({ message: "Salary record not found" });
        }

        await db.execute("DELETE FROM salary_details WHERE id = ?", [id]);
        
        res.json({ message: "Salary record deleted successfully" });

    } catch (err) {
        console.error("Delete salary error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Calculate salary for a specific month (with leave deductions)
exports.calculateMonthlySalary = async (req, res) => {
    try {
        const { employee_id, year, month } = req.body;
        
        if (!employee_id || !year || !month) {
            return res.status(400).json({ 
                message: "Missing required fields: employee_id, year, month" 
            });
        }

        // Get current salary details
        const [[salary]] = await db.execute(
            `SELECT * FROM salary_details 
             WHERE employee_id = ? 
             ORDER BY effective_from DESC 
             LIMIT 1`,
            [employee_id]
        );

        if (!salary) {
            return res.status(404).json({ message: "No salary record found for employee" });
        }

        // Get leave taken in the month
        const startDate = `${year}-${month}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        
        const [leaves] = await db.execute(
            `SELECT leave_type, 
                    DATEDIFF(LEAST(end_date, ?), GREATEST(start_date, ?)) + 1 as days
             FROM leaves 
             WHERE user_id = ? 
               AND status = 'approved'
               AND start_date <= ? 
               AND end_date >= ?`,
            [endDate, startDate, employee_id, endDate, startDate]
        );

        const totalLeaveDays = leaves.reduce((sum, leave) => sum + leave.days, 0);
        
        // Calculate per day salary
        const workingDaysInMonth = new Date(year, month, 0).getDate();
        const perDaySalary = salary.basic_salary / workingDaysInMonth;
        
        // Calculate deductions
        const leaveDeduction = perDaySalary * totalLeaveDays;
        const totalDeductions = salary.income_tax + salary.provident_fund + 
                                salary.health_insurance + leaveDeduction;
        const grossSalary = salary.basic_salary + salary.hra + salary.da + salary.other_allowances;
        const netSalary = grossSalary - totalDeductions;

        res.json({
            employee_id,
            month: `${year}-${month}`,
            salary_details: {
                basic_salary: salary.basic_salary,
                hra: salary.hra,
                da: salary.da,
                other_allowances: salary.other_allowances,
                income_tax: salary.income_tax,
                provident_fund: salary.provident_fund,
                health_insurance: salary.health_insurance
            },
            leave_details: {
                total_leaves_taken: totalLeaveDays,
                leave_deduction: leaveDeduction,
                leaves: leaves
            },
            calculation: {
                gross_salary: grossSalary,
                total_deductions: totalDeductions,
                net_salary: netSalary,
                per_day_salary: perDaySalary
            }
        });

    } catch (err) {
        console.error("Calculate monthly salary error:", err);
        res.status(500).json({ error: err.message });
    }
};