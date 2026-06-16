const db = require("../config/db");
const bcrypt = require("bcrypt");


exports.getEmployees = async (req, res) => {
  try {

    const { organization_id } = req.params;

    if (!organization_id) {
      return res.status(400).json({
        success:false,
        message:"organization_id is required"
      });
    }

    const sql = `
      SELECT

        e.id,
        e.organization_id,
        e.user_id,
        e.branch_id,
        u.name,
        u.email,
        u.mobilenumber,

        e.employee_code,
        e.department_id,
        e.designation_id,
        e.reporting_manager_id,
        e.joining_date,
        e.employment_type,
        e.work_location,
        e.status,
        e.grace_period_minutes,
        e.created_at,
        e.updated_at,

        d.name AS department_name,

        des.name AS designation_name,
        b.branch_name,
        b.branch_code,
        b.city AS branch_city,
        
          rm.employee_code
        AS reporting_manager_code,

        manager.name
        AS reporting_manager_name

      FROM employees e

      LEFT JOIN users u
      ON e.user_id = u.id

      LEFT JOIN departments d
      ON e.department_id = d.id

      LEFT JOIN designations des
      ON e.designation_id = des.id

      LEFT JOIN branches b ON e.branch_id = b.id 

      LEFT JOIN employees rm
      ON e.reporting_manager_id = rm.id

      LEFT JOIN users manager
      ON rm.user_id = manager.id

      WHERE e.organization_id = ?

    `;

    const [result] =
    await db.query(
      sql,
      [
        Number(
          organization_id
        )
      ]
    );

    return res.status(200).json({
      success:true,
      data:result
    });

  }
  catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      error:err.message
    });

  }

};



// Get Employes By Id
exports.getEmployeeById = async (req, res) => {

  try {

    const { id } = req.params;

    const [result] = await db.query(
      `
      SELECT
        e.*,
        e.branch_id, 
        d.name AS department_name,
        des.name AS designation_name,
        rm.employee_code AS reporting_manager_code
         b.branch_name,  
        b.branch_code,
         b.city AS branch_city,
        b.state AS branch_state

      FROM employees e

      LEFT JOIN departments d
      ON e.department_id = d.id

      LEFT JOIN designations des
      ON e.designation_id = des.id

      LEFT JOIN employees rm
      ON e.reporting_manager_id = rm.id

      WHERE e.id = ?
      `,
      [id]
    );

    if (!result.length) {
      return res.status(404).json({
        success:false,
        message:"Employee not found"
      });
    }

    res.json({
      success:true,
      data:result[0]
    });

  } catch (err) {

    res.status(500).json({
      success:false,
      error:err.message
    });

  }

};


exports.addEmployee = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      organization_id,
      branch_id,
      name,
      email,
      mobile,
      password,
      employee_code,
      department_id,
      designation_id,
      reporting_manager_id,
      joining_date,
      employment_type,
      work_location,
      status,
      grace_period_minutes, 
      salary_structure,  // Add this
      leave_balance      // Add this
    } = req.body;
    
    console.log('organization_id', organization_id, name, mobile, employee_code)

    // validation
    if (!organization_id || !name || !mobile || !employee_code) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Required fields missing"
      });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(
      password || "123456",
      10
    );

      if (branch_id) {
      const [branchExists] = await connection.query(
        'SELECT id FROM branches WHERE id = ? AND organization_id = ? AND status = "active"',
        [branch_id, organization_id]
      );
      
      if (!branchExists.length) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid branch_id or branch is inactive"
        });
      }
    }


    // create user
    const [userResult] = await connection.query(
      `
      INSERT INTO users (
        organization_id,
        name,
        email,
        mobilenumber,
        password,
        status,
        role,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        organization_id,
        name,
        email || null,
        mobile,
        hashedPassword,
        "Active",
        "employee",
        1
      ]
    );

    const user_id = userResult.insertId;

    // create employee
    const [employeeResult] = await connection.query(
      `
      INSERT INTO employees (
        organization_id,
        user_id,
        branch_id,
        employee_code,
        department_id,
        designation_id,
        reporting_manager_id,
        joining_date,
        employment_type,
        work_location,
        status,
         grace_period_minutes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?)
      `,
      [
        organization_id,
        user_id,
         branch_id ,
        employee_code,
        department_id || null,  
        designation_id || null,
        reporting_manager_id || null,
        joining_date || null,
        employment_type || "full_time",
        work_location || null,
        status || "active",
        grace_period_minutes || 0
      ]
    );

    const employee_id = employeeResult.insertId;

    // Insert salary structure if provided
    if (salary_structure) {
      const effective_from = joining_date || new Date().toISOString().split('T')[0];
      
      await connection.query(
        `INSERT INTO salary_structures (
          employee_id, 
          basic_salary, 
          hra, 
          da, 
          other_allowances,
          special_allowance,
          income_tax, 
          provident_fund, 
          professional_tax,
          health_insurance, 
          net_salary,
          bank_name,
          account_number,
          ifsc_code,
          effective_from
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employee_id,
          salary_structure.basic_salary || 0,
          salary_structure.hra || 0,
          0, // da - default to 0 if not provided
          salary_structure.other_allowances || 0,
          salary_structure.special_allowance || 0,
          salary_structure.income_tax || 0,
          salary_structure.pf_deduction || 0, // Note: your form uses pf_deduction
          salary_structure.professional_tax || 0,
          salary_structure.health_insurance || 0,
          salary_structure.net_salary || 0,
          salary_structure.bank_name || null,
          salary_structure.account_number || null,
          salary_structure.ifsc_code || null,
          effective_from
        ]
      );
    }

    // Insert leave balance if provided
    if (leave_balance) {
      await connection.query(
        `INSERT INTO leave_balances (
          user_id,
          annual_total,
          sick_total,
          casual_total,
          year
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          employee_id,
          leave_balance.annual_leave || 12,
          leave_balance.sick_leave || 12,
          leave_balance.casual_leave || 6,
          new Date().getFullYear()
        ]
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Employee added successfully",
      userId: user_id,
      employeeId: employee_id
    });

  } catch (err) {
    await connection.rollback();
    console.error("Add employee error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  } finally {
    connection.release();
  }
};

// Update Employee
exports.updateEmployee = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const {
      organization_id,
      branch_id,
      name,
      email,
      mobile,
      password,
      employee_code,
      department_id,
      designation_id,
      reporting_manager_id,
      joining_date,
      employment_type,
      work_location,
      status,
      grace_period_minutes
    } = req.body;

    // get employee + linked user
    const [existingEmployee] = await connection.query(
      `
      SELECT user_id
      FROM employees
      WHERE id = ?
      `,
      [id]
    );

    if (!existingEmployee.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    const user_id = existingEmployee[0].user_id;
     const current_org_id = existingEmployee[0].organization_id;


       if (branch_id) {
      const [branchExists] = await connection.query(
        'SELECT id FROM branches WHERE id = ? AND organization_id = ? AND status = "active"',
        [branch_id, organization_id || current_org_id]
      );
      
      if (!branchExists.length) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid branch_id or branch is inactive"
        });
      }
    }

    // update user table
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);

      await connection.query(
        `
        UPDATE users
        SET
          organization_id = ?,
          name = ?,
          email = ?,
          mobilenumber = ?,
          password = ?
        WHERE id = ?
        `,
        [
          organization_id,
          name,
          email || null,
          mobile,
          hashedPassword,
          user_id
        ]
      );
    } else {
      await connection.query(
        `
        UPDATE users
        SET
          organization_id = ?,
          name = ?,
          email = ?,
          mobilenumber = ?
        WHERE id = ?
        `,
        [
          organization_id,
          name,
          email || null,
          mobile,
          user_id
        ]
      );
    }

    // update employee table
    await connection.query(
      `
      UPDATE employees
      SET
        organization_id = ?,
         branch_id = ?, 
        employee_code = ?,
        department_id = ?,
        designation_id = ?,
        reporting_manager_id = ?,
        joining_date = ?,
        employment_type = ?,
        work_location = ?,
        status = ?,
        grace_period_minutes = ?
      WHERE id = ?
      `,
      [
        organization_id,
         branch_id || null,
        employee_code,
        department_id || null,
        designation_id || null,
        reporting_manager_id || null,
        joining_date || null,
        employment_type || "full_time",
        work_location || null,
        status || "active",
        grace_period_minutes || 0,
        id
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Employee updated successfully"
    });

  } catch (err) {
    await connection.rollback();

    console.log(err);

    res.status(500).json({
      success: false,
      error: err.message
    });

  } finally {
    connection.release();
  }
};

exports.deleteEmployee = async (req, res) => {

  try {

    const { id } = req.params;

    await db.query(
      `DELETE FROM employees WHERE id=?`,
      [id]
    );

    res.json({
      success:true,
      message:"Employee deleted successfully"
    });

  } catch (err) {

    res.status(500).json({
      success:false,
      error:err.message
    });

  }

};




exports.getEmployeesByBranch = async (req, res) => {
  try {
    const { branch_id } = req.params;
    const { organization_id } = req.query;

    if (!branch_id || !organization_id) {
      return res.status(400).json({
        success: false,
        message: "branch_id and organization_id are required"
      });
    }

    const sql = `
      SELECT
        e.id,
        e.employee_code,
        e.first_name,
        e.last_name,
        u.name,
        u.email,
        u.mobilenumber,
        e.designation_id,
        des.name AS designation_name,
        e.joining_date,
        e.status
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN designations des ON e.designation_id = des.id
      WHERE e.branch_id = ? AND e.organization_id = ?
      ORDER BY e.created_at DESC
    `;

    const [result] = await db.query(sql, [branch_id, organization_id]);

    return res.status(200).json({
      success: true,
      data: result,
      count: result.length
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};



exports.assignEmployeeBranch = async (req, res) => {
  try {
    const { id } = req.params; // employee id
    const { branch_id, organization_id } = req.body;

    if (!id || !branch_id || !organization_id) {
      return res.status(400).json({
        success: false,
        message: "employee id, branch_id, and organization_id are required"
      });
    }

    // Check if branch exists and is active
    const [branch] = await db.query(
      'SELECT id, branch_name FROM branches WHERE id = ? AND organization_id = ? AND status = "active"',
      [branch_id, organization_id]
    );

    if (!branch.length) {
      return res.status(404).json({
        success: false,
        message: "Branch not found or inactive"
      });
    }

    // Check if employee exists
    const [employee] = await db.query(
      'SELECT id FROM employees WHERE id = ? AND organization_id = ?',
      [id, organization_id]
    );

    if (!employee.length) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    // Update employee branch
    await db.query(
      'UPDATE employees SET branch_id = ? WHERE id = ?',
      [branch_id, id]
    );

    return res.status(200).json({
      success: true,
      message: `Employee assigned to ${branch[0].branch_name} successfully`,
      data: {
        employee_id: id,
        branch_id: branch_id,
        branch_name: branch[0].branch_name
      }
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};