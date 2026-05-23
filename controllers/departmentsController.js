const db = require('../config/db');


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



exports.getDepartments = async (req, res) => {
  try {

    const [results] = await db.query(
      `SELECT * FROM departments WHERE status = 1`
    );

    res.status(200).json({
      success: true,
      data: results,
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch departments",
      error: err.message,
    });
  }
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

