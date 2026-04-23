exports.applyLeave = (req, res) => {
  const { employee_id, from_date, to_date, status } = req.body;

  if (!employee_id || !from_date || !to_date) {
    return res.status(400).json({ message: "All fields required" });
  }

  db.query(
    `INSERT INTO leaves (employee_id, from_date, to_date, status)
     VALUES (?, ?, ?, ?)`,
    [employee_id, from_date, to_date, status || "Pending"],
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.json({
        message: "Leave applied successfully",
        leaveId: result.insertId
      });
    }
  );
};

exports.getLeaves = (req, res) => {
  db.query(
    `SELECT * FROM leaves ORDER BY id DESC`,
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    }
  );
};


exports.getLeavesByEmployee = (req, res) => {
  const { employee_id } = req.params;

  db.query(
    `SELECT * FROM leaves WHERE employee_id=? ORDER BY id DESC`,
    [employee_id],
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    }
  );
};



exports.updateLeaveStatus = (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  db.query(
    `UPDATE leaves SET status=? WHERE id=?`,
    [status, id],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Leave status updated successfully" });
    }
  );
};

exports.deleteLeave = (req, res) => {
  const { id } = req.params;

  db.query(`DELETE FROM leaves WHERE id=?`, [id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Leave deleted successfully" });
  });
};

