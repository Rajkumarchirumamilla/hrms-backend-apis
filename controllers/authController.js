const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { sendMessage } = require('../utils/sendMessage');


exports.register = async (req, res) => {
  try {
    console.log('register')
    const { mobilenumber, password, name, roleName } = req.body;

    if (!mobilenumber || !password || !name) {
      return res.status(400).json({ message: 'All fields required' }); 
    }

    const hash = await bcrypt.hash(password, 10);
    // const userId = uuidv4();

      const [result] =   await db.execute(
      'INSERT INTO users ( mobilenumber, password, name, status) VALUES ( ?, ?, ?, ?)',
      [ mobilenumber, hash, name, 'Active']
    );
 
    const userId = result.insertId;


    const [roleRows] = await db.execute(
      'SELECT id FROM roles WHERE name = ?',
      [roleName || 'EMPLOYE']
    );

    console.log([roleRows])

    if (!roleRows.length) {
      return res.status(400).json({ message: 'Role not found' });
    }
  

    await db.execute(
      'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [userId, roleRows[0].id]
    );

    const token = jwt.sign(
  { userId, mobilenumber },
  "your_secret_key", // ⚠️ move to .env later
  { expiresIn: "7d" }
);

  res.status(200).json({
  message: 'User created successfully',
      token,
      user: {
        id: userId,
        name,
        mobilenumber,
      }
    });

  } catch (err) {
    console.error('REGISTER ERROR:', err);
    res.status(500).json({ error: err.message });
  }
};


exports.login = async (req, res) => {
  try {
    const { mobilenumber, password } = req.body;

    if (!mobilenumber || !password) {
      return res.status(400).json({ message: 'Mobile & password required' });
    }

   
    const [users] = await db.execute(
      `SELECT u.id, u.name, u.password, u.status, r.name as role
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.mobilenumber = ?`,
      [mobilenumber]
    );

    if (!users.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = users[0];

    if (user.status !== 'Active') {
      return res.status(403).json({ message: 'User is blocked' });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ message: 'Wrong password' });
    }

    const token = jwt.sign(
      {
        id: user.id,  
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Login successful',
      token
    });

  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ error: err.message });
  }
};


exports.sendOtp = async (req, res) => {
  try {
    const { mobilenumber } = req.body;

    if (!mobilenumber) {
      return res.status(400).json({ message: "Mobile number required" });
    }

    // Check user exists
    const [users] = await db.execute(
      "SELECT id FROM users WHERE mobilenumber = ?",
      [mobilenumber]
    );

    if (!users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Save OTP
    await db.execute(
      "INSERT INTO otp_verification (mobilenumber, otp, expires_at) VALUES (?, ?, ?)",
      [mobilenumber, otp, expiresAt]
    );

    // ✅ SEND SMS USING YOUR EXISTING SERVICE
    await sendMessage(
      { mobile: mobilenumber },
      "forgot-password",
      { otp }
    );

    res.json({
      message: "OTP sent successfully",
    });

  } catch (err) {
    console.error("SEND OTP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};


exports.resetPassword = async (req, res) => {
  try {
    const { mobilenumber, otp, newPassword } = req.body;

    if (!mobilenumber || !otp || !newPassword) {
      return res.status(400).json({ message: "All fields required" });
    }

    // ✅ Get latest OTP
    const [rows] = await db.execute(
      "SELECT * FROM otp_verification WHERE mobilenumber = ? ORDER BY id DESC LIMIT 1",
      [mobilenumber]
    );

    if (!rows.length) {
      return res.status(400).json({ message: "OTP not found" });
    }

    const record = rows[0];

    // ✅ Check expiry
    if (new Date() > new Date(record.expires_at)) {
      return res.status(400).json({ message: "OTP expired" });
    }

    // ✅ Check OTP match
    if (record.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // ✅ Hash new password
    const hash = await bcrypt.hash(newPassword, 10);

    // ✅ Update password
    await db.execute(
      "UPDATE users SET password = ? WHERE mobilenumber = ?",
      [hash, mobilenumber]
    );

    // ✅ Delete OTP after use (VERY IMPORTANT)
    await db.execute(
      "DELETE FROM otp_verification WHERE mobilenumber = ?",
      [mobilenumber]
    );

    res.json({
      message: "Password reset successful",
    });

  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // ✅ Extract token from header
    const token = req.headers.authorization?.split(" ")[1];

    const [users] = await db.execute(
      `SELECT u.id, u.name, u.mobilenumber, u.status, r.name as role
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ?`,
      [userId]
    );

    if (!users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      user: users[0],
      token: token   // ✅ send same token
    });

  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};



exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("userid", userId);

    // ✅ Step 1: Get employee_id
    const [[emp]] = await db.execute(
      "SELECT id FROM employees WHERE user_id = ?",
      [userId]
    );

    if (!emp) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const employeeId = emp.id;

    // 1. Attendance %
    const [[attendance]] = await db.execute(`
      SELECT 
        IFNULL((SUM(status = 'Present') / NULLIF(COUNT(*), 0)) * 100, 0) as percentage
      FROM attendance
      WHERE employee_id = ?
    `, [employeeId]);

    // 2. Leave Used
    const [[leave]] = await db.execute(`
      SELECT 
        IFNULL(SUM(DATEDIFF(to_date, from_date) + 1), 0) as used
      FROM leaves
      WHERE employee_id = ? AND status = 'Approved'
    `, [employeeId]);

    const totalLeaves = 15;

    // 3. Salary (FIXED)
    const [[salary]] = await db.execute(`
      SELECT amount 
      FROM salary 
      WHERE employee_id = ?
      ORDER BY year DESC, month DESC
      LIMIT 1
    `, [employeeId]);

    // 4. Work Hours
    const [[workHours]] = await db.execute(`
      SELECT IFNULL(SUM(working_hours), 0) as total
      FROM attendance
      WHERE employee_id = ?
    `, [employeeId]);

    const totalHours = workHours.total || 0;

    let workStatus = "On Track";
    if (totalHours < 160) workStatus = "Below Target";
    if (totalHours > 200) workStatus = "Overtime";

    res.json({
      attendance_percentage: attendance.percentage || 0,
      attendance_trend: 2.5,
      leave_balance_days: totalLeaves - (leave.used || 0),
      leave_used: leave.used || 0,
      salary_amount: salary?.amount || 0,
      salary_trend: 5.2,
      work_hours_total: totalHours,
      work_hours_status: workStatus,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};