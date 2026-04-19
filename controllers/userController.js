const db = require("../config/db");
const bcrypt = require("bcrypt");

// Get Profile
exports.getProfile = (req, res) => {
  const userId = req.user.id;

  db.query(
    "SELECT id, name, email, role FROM users WHERE id=?",
    [userId],
    (err, result) => {
      if (err) return res.status(500).json({ message: "DB error" });

      res.json(result[0]);
    }
  );
};

// Update Profile
exports.updateProfile = (req, res) => {
  const { name, email } = req.body;

  db.query(
    "UPDATE users SET name=?, email=? WHERE id=?",
    [name, email, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: "DB error" });

      res.json({ message: "Profile updated" });
    }
  );
};

// Change Password
exports.changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  db.query(
    "SELECT password FROM users WHERE id=?",
    [req.user.id],
    async (err, result) => {
      const user = result[0];

      const isMatch = await bcrypt.compare(oldPassword, user.password);

      if (!isMatch) {
        return res.status(400).json({ message: "Old password incorrect" });
      }

      const hashed = await bcrypt.hash(newPassword, 12);

      db.query(
        "UPDATE users SET password=? WHERE id=?",
        [hashed, req.user.id],
        () => {
          res.json({ message: "Password updated" });
        }
      );
    }
  );
};