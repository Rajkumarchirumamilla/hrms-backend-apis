const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// Register
exports.register = async (req, res) => {
  try {
    const { id, name, email, password, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    db.query(
      "INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
      [id, name, email, hashedPassword, role || "employee"],
      (err) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ message: "Email already exists" });
          }
          return res.status(500).json({ message: "Database error" });
        }

        res.status(200).json({ message: "User registered successfully" });
      }
    );

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// User Login
exports.login = (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email=?", [email], async (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });

    if (result.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = result[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    res.json({
      message: "Login successful",
      token
    });
  });
};

// Forgot Password
exports.forgotPassword = (req, res) => {
  const { email } = req.body;

  const resetToken = crypto.randomBytes(32).toString("hex");

  db.query(
    "UPDATE users SET reset_token=? WHERE email=?",
    [resetToken, email],
    (err, result) => {
      if (err) return res.status(500).json({ message: "DB error" });

      if (result.affectedRows === 0) {
        return res.status(400).json({ message: "User not found" });
      }

      res.json({
        message: "Reset token generated",
        resetToken
      });
    }
  );
};

// Reset Password
exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  db.query(
    "UPDATE users SET password=?, reset_token=NULL WHERE reset_token=?",
    [hashedPassword, token],
    (err, result) => {
      if (err) return res.status(500).json({ message: "DB error" });

      if (result.affectedRows === 0) {
        return res.status(400).json({ message: "Invalid token" });
      }

      res.json({ message: "Password reset successful" });
    }
  );
};