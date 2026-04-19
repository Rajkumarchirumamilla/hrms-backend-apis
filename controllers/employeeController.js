const db = require("../config/db");

// Get All Employees
exports.getEmployees = (req, res) => {
  db.query("SELECT * FROM employees", (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
};

// Get Employes By Id
exports.getEmployeeById = (req, res) => {
  const { id } = req.params;

  db.query("SELECT * FROM employees WHERE id=?", [id], (err, result) => {
    if (err) return res.status(500).json(err);
    if (result.length === 0) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.json(result[0]);
  });
};

// Create Employee
exports.addEmployee = (req, res) => {
  const {
    id,
    user_id,
    employee_code,
    department,
    designation,
    joining_date,
    salary
  } = req.body;

  db.query(
    `INSERT INTO employees 
    (id, employee_code, department, designation, joining_date, salary)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [id, employee_code, department, designation, joining_date, salary],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Employee added successfully" });
    }
  );
};

// Update Employee
exports.updateEmployee = (req, res) => {
  const { id } = req.params;
  const { department, designation, salary } = req.body;

  db.query(
    `UPDATE employees 
     SET department=?, designation=?, salary=? 
     WHERE id=?`,
    [department, designation, salary, id],
    (err, result) => {
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