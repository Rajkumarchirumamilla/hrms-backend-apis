exports.addDepartment = (req, res) => {
  const { name, status } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Department name is required" });
  }

  db.query(
    `INSERT INTO department (name, status) VALUES (?, ?)`,
    [name, status ?? 1], // default = 1
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.json({
        message: "Department added successfully",
        departmentId: result.insertId
      });
    }
  );
};



exports.getDepartments = (req, res) => {
  db.query(
    `SELECT * FROM department WHERE status = 1`,
    (err, results) => {
      if (err) return res.status(500).json(err);

      res.json(results);
    }
  );
};



exports.updateDepartment = (req, res) => {
  const { id, name, status } = req.body;

  db.query(
    `UPDATE department SET name = ?, status = ? WHERE id = ?`,
    [name, status, id],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Department updated successfully" });
    }
  );
};



exports.deleteDepartment = (req, res) => {
  const { id } = req.body;

  db.query(
    `UPDATE department SET status = 0 WHERE id = ?`,
    [id],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Department deleted successfully" });
    }
  );
};