const db = require("../config/db");

// Get All Employees
exports.getEmployees = (req, res) => {
  db.query(
    `SELECT 
      e.*,
      d.name AS department_name,
      des.name AS designation_name,
      rm.employee_code AS reporting_manager_code
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN designations des ON e.designation_id = des.id
     LEFT JOIN employees rm ON e.reporting_manager_id = rm.id`,
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    }
  );
};

// Get Employes By Id
exports.getEmployeeById = (req, res) => {
  const { id } = req.params;

  db.query(
    `SELECT 
      e.*,
      d.name AS department_name,
      des.name AS designation_name,
      rm.employee_code AS reporting_manager_code
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN designations des ON e.designation_id = des.id
     LEFT JOIN employees rm ON e.reporting_manager_id = rm.id
     WHERE e.id = ?`,
    [id],
    (err, result) => {
      if (err) return res.status(500).json(err);

      if (!result.length) {
        return res.status(404).json({ message: "Employee not found" });
      }

      res.json(result[0]);
    }
  );
};

// Create Employee
exports.addEmployee = (req, res) => {
  console.log('emplieys')
  const {
    user_id,
    employee_code,
    department_id,
    designation_id,
    reporting_manager_id,
    joining_date,
    employment_type,
    work_location,
    status
  } = req.body;

  db.query(
    `INSERT INTO employees 
    (user_id, employee_code, department_id, designation_id, reporting_manager_id, joining_date, employment_type, work_location, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user_id,
      employee_code,
      department_id,
      designation_id,
      reporting_manager_id,
      joining_date,
      employment_type,
      work_location,
      status ?? 1
    ],
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.json({
        message: "Employee added successfully",
        employeeId: result.insertId
      });
    }
  );
};

// Update Employee
exports.updateEmployee = (req, res) => {
  const { id } = req.params;

  const {
    department_id,
    designation_id,
    reporting_manager_id,
    employment_type,
    work_location,
    status
  } = req.body;

  db.query(
    `UPDATE employees 
     SET department_id=?, designation_id=?, reporting_manager_id=?, employment_type=?, work_location=?, status=? 
     WHERE id=?`,
    [
      department_id,
      designation_id,
      reporting_manager_id,
      employment_type,
      work_location,
      status,
      id
    ],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Employee updated successfully" });
    }
  );
};

// Delete Employee By Id
exports.deleteEmployee = (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM employees WHERE id=?", [id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Employee deleted successfully" });
  });
};