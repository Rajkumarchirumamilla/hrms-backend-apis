exports.addDesignation = (req, res) => {
  const { name, status } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Designation name is required" });
  }

  db.query(
    `INSERT INTO designations (name, status) VALUES (?, ?)`,
    [name, status ?? 1],
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.json({
        message: "Designation added successfully",
        designationId: result.insertId
      });
    }
  );
};



exports.getDesignations = (req, res) => {
  db.query(
    `SELECT * FROM designations WHERE status = 1`,
    (err, results) => {
      if (err) return res.status(500).json(err);

      res.json(results);
    }
  );
};



exports.updateDesignation = (req, res) => {
  const { id, name, status } = req.body;

  db.query(
    `UPDATE designations SET name = ?, status = ? WHERE id = ?`,
    [name, status, id],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Designation updated successfully" });
    }
  );
};




exports.deleteDesignation = (req, res) => {
  const { id } = req.body;

  db.query(
    `UPDATE designations SET status = 0 WHERE id = ?`,
    [id],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Designation deleted successfully" });
    }
  );
};