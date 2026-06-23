const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { sendMessage } = require('../utils/sendMessage');


const formatDate = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

// Helper: Format time
const formatTime12Hour = (time) => {
  if (!time) return null;
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
};


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
      return res.status(400).json({
        message: "Mobile & password required"
      });
    }

    const [users] = await db.execute(
      `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.mobilenumber,
        u.password,
        u.status,

        r.name AS role,

        e.organization_id,
        e.address,
        e.employee_code,
        e.joining_date,
        e.employment_type,
        e.work_location,

        d.name AS department,
        des.name AS designation,

        manager.name AS manager

      FROM users u

      JOIN user_roles ur
      ON u.id = ur.user_id

      JOIN roles r
      ON r.id = ur.role_id

      LEFT JOIN employees e
      ON e.user_id = u.id

      LEFT JOIN departments d
      ON d.id = e.department_id

      LEFT JOIN designations des
      ON des.id = e.designation_id

      LEFT JOIN employees rm
      ON rm.id = e.reporting_manager_id

      LEFT JOIN users manager
      ON manager.id = rm.user_id

      WHERE u.mobilenumber = ?
      `,
      [mobilenumber]
    );

    if (!users.length) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const user = users[0];

    if (user.status !== "Active") {
      return res.status(403).json({
        message: "User is blocked"
      });
    }

    const match = await bcrypt.compare(
      password,
      user.password
    );

    if (!match) {
      return res.status(401).json({
        message: "Wrong password"
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d"
      }
    );
    console.log(process.env.JWT_SECRET)
    res.json({
      message: "Login successful",

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobilenumber: user.mobilenumber,
        status: user.status,
        role: user.role,
        address: user.address
      },

      employee: {
        department: user.department,
        designation: user.designation,
        employeeId: user.employee_code,
        organization_id: user.organization_id,
        joiningDate: user.joining_date,
        manager: user.manager,
        employmentType: user.employment_type,
        workLocation: user.work_location
      },

      token
    });

  } catch (err) {
    console.error(
      "LOGIN ERROR:",
      err
    );

    res.status(500).json({
      error: err.message
    });
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

    const token = req.headers.authorization?.split(" ")[1];

   const [users] = await db.execute(
  `
  SELECT 
    u.id,
    u.name,
    u.email,
    u.mobilenumber,
    u.status,

    r.name AS role,

    e.organization_id,
    e.address,
    e.employee_code,
    e.joining_date,
    e.employment_type,
    e.work_location,

    d.name AS department,
    des.name AS designation,

    manager.name AS manager

  FROM users u

  JOIN user_roles ur 
  ON u.id = ur.user_id

  JOIN roles r 
  ON r.id = ur.role_id

  LEFT JOIN employees e 
  ON e.user_id = u.id

  LEFT JOIN departments d
  ON d.id = e.department_id

  LEFT JOIN designations des
  ON des.id = e.designation_id

  LEFT JOIN employees rm
  ON rm.id = e.reporting_manager_id

  LEFT JOIN users manager
  ON manager.id = rm.user_id

  WHERE u.id = ?
  `,
  [userId]
);

    if (!users.length) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const user = users[0];

  res.json({
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    mobilenumber: user.mobilenumber,
    status: user.status,
    role: user.role,
    address: user.address,
  },

  employee: {
    department: user.department,
    designation: user.designation,
    employeeId: user.employee_code,
    organization_id: user.organization_id,
    joiningDate: user.joining_date,
    manager: user.manager,
    employmentType: user.employment_type,
    workLocation: user.work_location,
  },

  token
});
  } catch (err) {
    console.error("GET PROFILE ERROR:", err);

    res.status(500).json({
      error: err.message
    });
  }
};    

exports.adminGetProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const token = req.headers.authorization?.split(" ")[1];

    const [users] = await db.execute(
      `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.mobilenumber,
        u.status,

        r.name AS role,

        e.organization_id,
        e.address,
        e.employee_code,
        e.joining_date,
        e.employment_type,
        e.work_location,

        d.name AS department,
        des.name AS designation,

        manager.name AS manager,

        -- Organization Details
        org.id AS org_id,
        org.name AS organization_name,
        org.email AS organization_email,
        org.phone AS organization_phone,
        org.address AS organization_address,
        org.logo_url AS organization_logourl

      FROM users u

      JOIN user_roles ur 
        ON u.id = ur.user_id

      JOIN roles r 
        ON r.id = ur.role_id

      LEFT JOIN employees e 
        ON e.user_id = u.id

      LEFT JOIN departments d
        ON d.id = e.department_id

      LEFT JOIN designations des
        ON des.id = e.designation_id

      LEFT JOIN employees rm
        ON rm.id = e.reporting_manager_id

      LEFT JOIN users manager
        ON manager.id = rm.user_id

      LEFT JOIN organizations org
        ON org.id = e.organization_id

      WHERE u.id = ?
      `,
      [userId]
    );

    if (!users.length) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = users[0];

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobilenumber: user.mobilenumber,
        status: user.status,
        role: user.role,
        address: user.address,
      },

      employee: {
        department: user.department,
        designation: user.designation,
        employeeId: user.employee_code,
        organization_id: user.organization_id,
        joiningDate: user.joining_date,
        manager: user.manager,
        employmentType: user.employment_type,
        workLocation: user.work_location,
      },

      organization: {
        id: user.org_id,
        name: user.organization_name,
        email: user.organization_email,
        phone: user.organization_phone,
        address: user.organization_address,
        logourl:user.organization_logourl
      },

      token,
    });
  } catch (err) {
    console.error("GET PROFILE ERROR:", err);

    res.status(500).json({
      error: err.message,
    });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get employee_id
    const [[emp]] = await db.execute(
      "SELECT id FROM employees WHERE user_id = ?",
      [userId]
    );

    if (!emp) {
      return res.status(404).json({
        message: "Employee not found"
      });
    }

    const employeeId = emp.id;

    // ================================
    // 1. Attendance Percentage
    // ================================
    const [[attendance]] = await db.execute(`
  SELECT 
    ROUND(
      (COUNT(*) / 30) * 100,
      2
    ) AS percentage
  FROM attendance
  WHERE employee_id = ?
  AND LOWER(status) = 'completed'
`, [employeeId]);

    // ================================
    // 2. Leave Balances
    // ================================
    const [[leaveBalance]] = await db.execute(`
      SELECT 
        casual_used,
        casual_total,
        sick_used,
        sick_total,
        annual_used,
        annual_total
      FROM leave_balances
      WHERE user_id = ?
    `, [userId]);

   const totalLeaves = Number(leaveBalance?.annual_total || 0);

const usedLeaves = Number(leaveBalance?.annual_used || 0);

const remainingLeaves = totalLeaves - usedLeaves;

    // ================================
    // 3. Salary
    // ================================
    const [[salary]] = await db.execute(`
      SELECT amount
      FROM salary
      WHERE employee_id = ?
      ORDER BY year DESC, month DESC
      LIMIT 1
    `, [employeeId]);

    const monthlySalary = Number(salary?.amount || 0);

    // ================================
    // 4. Work Hours
    // ================================
    const [[workHours]] = await db.execute(`
      SELECT IFNULL(SUM(working_hours), 0) AS total
      FROM attendance
      WHERE employee_id = ?
    `, [employeeId]);

    const totalSeconds = Number(workHours.total || 0);

    const totalHours = totalSeconds / 3600;

    const workedDays = totalHours / 8;

    // ================================
    // 5. Earned Salary
    // ================================
    const workingDaysInMonth = 30;

    const dailySalary = monthlySalary / workingDaysInMonth;

    const earnedSalary = workedDays * dailySalary;

    // ================================
    // 6. Work Status
    // ================================
    let workStatus = "On Track";

    if (workedDays < 20) {
      workStatus = "Below Target";
    } else if (workedDays > 26) {
      workStatus = "Overtime";
    }

    // ================================
    // Final Response
    // ================================
    res.json({
      attendance_percentage: Number(attendance?.percentage || 0),

      attendance_trend: 0,

      leave_balance_days: remainingLeaves,

      leave_used: usedLeaves,

      monthly_salary: monthlySalary,

      salary_amount: earnedSalary.toFixed(2),

      salary_trend: 0,

      worked_days: workedDays.toFixed(2),

      work_hours_total: totalSeconds,

      work_hours_status: workStatus,
    });

  } catch (err) {
    console.error("Dashboard error:", err);

    res.status(500).json({
      error: err.message
    });
  }
};


// Get complete profile data
// exports.getProfile = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     // Get user with role
//     const [[user]] = await db.execute(
//       `SELECT u.id, u.name, u.mobilenumber as phone, u.email, u.status, 
//               u.created_at as joining_date, r.name as role
//        FROM users u
//        LEFT JOIN user_roles ur ON u.id = ur.user_id
//        LEFT JOIN roles r ON r.id = ur.role_id
//        WHERE u.id = ?`,
//       [userId]
//     );

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // Get employee details
//     const [[employee]] = await db.execute(
//       `SELECT e.id as employee_id, e.department, e.designation, 
//               e.office_id, e.manager_id, e.address, e.profile_image
//        FROM employees e
//        WHERE e.user_id = ?`,
//       [userId]
//     );

//     // Get manager name if exists
//     let managerName = null;
//     if (employee?.manager_id) {
//       const [[manager]] = await db.execute(
//         `SELECT name FROM users WHERE id = ?`,
//         [employee.manager_id]
//       );
//       managerName = manager?.name || null;
//     }

//     // Get quick stats
//     const [[stats]] = await db.execute(
//       `SELECT 
//         COUNT(DISTINCT p.id) as total_projects,
//         COUNT(DISTINCT t.id) as total_tasks,
//         IFNULL(AVG(pr.rating), 0) as avg_rating
//        FROM employees e
//        LEFT JOIN projects p ON FIND_IN_SET(e.id, p.team_members)
//        LEFT JOIN tasks t ON t.assigned_to = e.id
//        LEFT JOIN performance_reviews pr ON pr.employee_id = e.id
//        WHERE e.user_id = ?`,
//       [userId]
//     );

//     // Get attendance summary for current month
//     const now = new Date();
//     const [[attendance]] = await db.execute(
//       `SELECT 
//         COUNT(*) as total_days,
//         SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_days,
//         SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late_days,
//         SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_days
//        FROM attendance 
//        WHERE employee_id = ? 
//        AND MONTH(attendance_date) = ? 
//        AND YEAR(attendance_date) = ?`,
//       [employee?.id, now.getMonth() + 1, now.getFullYear()]
//     );

//     res.json({
//       user: {
//         id: user.id,
//         name: user.name,
//         email: user.email || user.phone + '@company.com',
//         phone: user.phone,
//         role: user.role || 'Employee',
//         status: user.status,
//         joiningDate: formatDate(user.joining_date),
//         avatar: employee?.profile_image || null,
//       },
//       employee: employee ? {
//         employeeId: `EMP-${String(employee.employee_id).padStart(6, '0')}`,
//         department: employee.department || 'Not Assigned',
//         designation: employee.designation || 'Employee',
//         officeId: employee.office_id,
//         address: employee.address || 'Not Provided',
//         manager: managerName || 'Not Assigned',
//       } : null,
//       stats: {
//         projects: stats?.total_projects || 0,
//         tasks: stats?.total_tasks || 0,
//         rating: parseFloat(stats?.avg_rating || 0).toFixed(1),
//         attendance: {
//           present: attendance?.present_days || 0,
//           late: attendance?.late_days || 0,
//           absent: attendance?.absent_days || 0,
//           total: attendance?.total_days || 0,
//         }
//       }
//     });

//   } catch (err) {
//     console.error("GET PROFILE ERROR:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, address, phone } = req.body;
    console.log('update prof')
    // Update users table
    await db.execute(
      `UPDATE users SET name = ?, email = ?, mobilenumber = ? WHERE id = ?`,
      [name, email, phone, userId]
    );

    // Update employees table
    await db.execute(
      `UPDATE employees SET address = ? WHERE user_id = ?`,
      [address, userId]
    );

    res.json({ message: "Profile updated successfully" });

  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const [[user]] = await db.execute(
      `SELECT password FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const bcrypt = require('bcrypt');
    const match = await bcrypt.compare(currentPassword, user.password);

    if (!match) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.execute(
      `UPDATE users SET password = ? WHERE id = ?`,
      [hash, userId]
    );

    res.json({ message: "Password changed successfully" });

  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// Upload profile image
exports.uploadProfileImage = async (req, res) => {
  try {
    const userId = req.user.id;
    const imageUrl = req.file?.path || req.body.imageUrl;

    if (!imageUrl) {
      return res.status(400).json({ message: "No image provided" });
    }

    await db.execute(
      `UPDATE employees SET profile_image = ? WHERE user_id = ?`,
      [imageUrl, userId]
    );

    res.json({ 
      message: "Profile image updated",
      imageUrl 
    });

  } catch (err) {
    console.
    
    
    error("UPLOAD IMAGE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};