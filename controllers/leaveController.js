const db = require("../config/db");


exports.applyLeave = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { leave_type, start_date, end_date, reason } = req.body;

    // Basic validation
    if (!leave_type || !start_date || !end_date) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ message: "Start date cannot be after end date" });
    }

    // Check overlapping leaves
    const [[overlap]] = await db.execute(
      `SELECT id FROM leaves 
       WHERE user_id = ? AND status != 'rejected'
       AND ((start_date BETWEEN ? AND ?) OR (end_date BETWEEN ? AND ?))`,
      [user_id, start_date, end_date, start_date, end_date]
    );

    if (overlap) {
      return res.status(409).json({ message: "Overlapping leave request exists" });
    }

    const [result] = await db.execute(
      `INSERT INTO leaves (user_id, leave_type, start_date, end_date, reason, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [user_id, leave_type, start_date, end_date, reason || '']
    );

    res.status(201).json({ 
      message: "Leave applied successfully", 
      leave_id: result.insertId 
    });
  } catch (err) {
    console.log("Apply leave error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getMyLeaves = async (req, res) => {
  try {
    const user_id = req.user.id;
    const [rows] = await db.execute(
      `SELECT id, leave_type, start_date, end_date, reason, status, applied_at
       FROM leaves WHERE user_id = ? ORDER BY applied_at DESC`,
      [user_id]
    );
    res.json({ leaves: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getLeaveBalance = async (req, res) => {
  try {
    const user_id = req.user.id;
    const [[balance]] = await db.execute(
      `SELECT casual_total, casual_used, sick_total, sick_used, annual_total, annual_used
       FROM leave_balances WHERE user_id = ?`,
      [user_id]
    );

    // Fallback if no row exists
    const b = balance || {
      casual_total: 12, casual_used: 0,
      sick_total: 10, sick_used: 0,
      annual_total: 15, annual_used: 0
    };
    
    res.json({
      casual: { used: b.casual_used, total: b.casual_total, remaining: b.casual_total - b.casual_used },
      sick:   { used: b.sick_used,   total: b.sick_total,   remaining: b.sick_total - b.sick_used },
      annual: { used: b.annual_used, total: b.annual_total, remaining: b.annual_total - b.annual_used },
    });
  } catch (err) {
    console.log(err.message)
    res.status(500).json({ error: err.message });
  }
};

// Manager only
exports.updateLeaveStatus = async (req, res) => {
 const leaveId= req.params.id;
 const{action}=req.body;  

  try {
    // Normalize action (avoid "Approve" vs "approve" issue)
    const normalizedAction = action?.toLowerCase();

    if (!leaveId || !normalizedAction) {
      return res.status(400).json({ message: "leaveId and action required" });
    }

    // 1. Get leave details
    const [[leave]] = await db.execute(
      `SELECT user_id, leave_type, start_date, end_date, status
       FROM leaves 
       WHERE id = ?`,
      [leaveId]
    );

    if (!leave) {
      return res.status(404).json({ message: "Leave not found" });
    }

    // Prevent double processing
    if (leave.status !== "pending") {
      return res.status(400).json({ message: "Already processed" });
    }

    // 2. Reject flow
    if (normalizedAction === "reject") {
      await db.execute(
        `UPDATE leaves SET status = 'rejected' WHERE id = ?`,
        [leaveId]
      );

      return res.json({ message: "Leave rejected" });
    }

    // 3. Approve flow
    if (normalizedAction === "approve") {

      // 🔥 STEP 1: Calculate number of days
      const [[daysResult]] = await db.execute(
        `SELECT DATEDIFF(?, ?) + 1 as days`,
        [leave.end_date, leave.start_date]
      );

      const days = daysResult.days;

      // 🔥 STEP 2: Ensure balance row exists
      await db.execute(
        `INSERT INTO leave_balances (user_id)
         VALUES (?)
         ON DUPLICATE KEY UPDATE user_id = user_id`,
        [leave.user_id]
      );

      // 🔥 STEP 3: Check remaining ANNUAL balance (main pool)
      const [[bal]] = await db.execute(
        `SELECT annual_total, annual_used 
         FROM leave_balances 
         WHERE user_id = ?`,
        [leave.user_id]
      );

      const remainingAnnual = bal.annual_total - bal.annual_used;

      if (remainingAnnual < days) {
        return res.status(400).json({
          message: "Not enough total (annual) leave balance"
        });
      }

      // 🔥 STEP 4: Update leave status
      await db.execute(
        `UPDATE leaves SET status = 'approved' WHERE id = ?`,
        [leaveId]
      );

      // Get employee id
      // Get employee id
const [[employee]] = await db.execute(
`
SELECT id
FROM employees
WHERE user_id = ?
`,
[leave.user_id]
);

if (employee) {

    let currentDate = new Date(leave.start_date);
    const endDate = new Date(leave.end_date);

    while (currentDate <= endDate) {

        const attendanceDate =
            currentDate.toISOString().split('T')[0];

        const [[existingAttendance]] = await db.execute(
        `
        SELECT id
        FROM attendance
        WHERE employee_id = ?
        AND attendance_date = ?
        `,
        [
            employee.id,
            attendanceDate
        ]
        );

        if (!existingAttendance) {

            await db.execute(
            `
            INSERT INTO attendance
            (
                employee_id,
                attendance_date,
                status
            )
            VALUES
            (
                ?,
                ?,
                'leave'
            )
            `,
            [
                employee.id,
                attendanceDate
            ]
            );

        }

        currentDate.setDate(
            currentDate.getDate() + 1
        );
    }
}

      // 🔥 STEP 5: ALWAYS reduce annual (main pool)
      await db.execute(
        `UPDATE leave_balances 
         SET annual_used = annual_used + ? 
         WHERE user_id = ?`,
        [days, leave.user_id]
      );

      // 🔥 STEP 6: Update specific leave type
      if (leave.leave_type === "casual") {
        await db.execute(
          `UPDATE leave_balances 
           SET casual_used = casual_used + ? 
           WHERE user_id = ?`,
          [days, leave.user_id]
        );
      }

      if (leave.leave_type === "sick") {
        await db.execute(
          `UPDATE leave_balances 
           SET sick_used = sick_used + ? 
           WHERE user_id = ?`,
          [days, leave.user_id]
        );
      }

      // (If annual leave → already counted above)

      return res.json({
        message: "Leave approved & balances updated successfully"
      });
    }

    // Invalid action
    return res.status(400).json({ message: "Invalid action" });

  } catch (err) {
    console.error("Leave update error:", err);
    res.status(500).json({ error: err.message });
  }
};



exports.approveLeave = async (req, res) => {
  const { leaveId } = req.body;

  try {
    // 1. Get leave details
    const [[leave]] = await db.execute(
      `SELECT user_id, leave_type, start_date, end_date 
       FROM leaves 
       WHERE id = ?`,
      [leaveId]
    );

    if (!leave) {
      return res.status(404).json({ message: "Leave not found" });
    }

    // 2. Calculate number of days
    const [[daysResult]] = await db.execute(
      `SELECT DATEDIFF(?, ?) + 1 as days`,
      [leave.end_date, leave.start_date]
    );

    const days = daysResult.days;

    // 3. Update leave status
    await db.execute(
      `UPDATE leaves SET status = 'approved' WHERE id = ?`,
      [leaveId]
    );

    // 4. Update leave balance dynamically
    let column = "";

    if (leave.leave_type === "casual") column = "casual_used";
    if (leave.leave_type === "sick") column = "sick_used";
    if (leave.leave_type === "annual") column = "annual_used";

    if (column) {
      await db.execute(
        `UPDATE leave_balances 
         SET ${column} = ${column} + ?
         WHERE user_id = ?`,
        [days, leave.user_id]
      );
    }

    res.json({ message: "Leave approved and balance updated" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
exports.getAllLeaves = async (req, res) => {
  try {

    const [rows] = await db.execute(`
      SELECT
        l.id,
        l.leave_type,
        l.start_date,
        l.end_date,
        l.reason,
        l.status,
        l.applied_at,

        e.employee_code AS employee_id,

        u.name AS full_name

      FROM leaves l

      JOIN employees e
      ON l.user_id = e.user_id

      JOIN users u
      ON l.user_id = u.id

      ORDER BY l.applied_at DESC
    `);

    res.json({
      leaves: rows
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: err.message
    });

  }
};
exports.editLeave = async (req, res) => {

  const leaveId = req.params.id;

  try {

    const [[leave]] = await db.execute(
      `
      SELECT
      user_id,
      leave_type,
      start_date,
      end_date,
      status
      FROM leaves
      WHERE id=?
      `,
      [leaveId]
    );

    if (!leave) {

      return res.status(404).json({
        message:"Leave not found"
      });

    }

    if (leave.status === "pending") {

      return res.json({
        message:"Already pending"
      });

    }

    const [[daysResult]] = await db.execute(
      `
      SELECT
      DATEDIFF(?, ?) + 1 AS days
      `,
      [leave.end_date, leave.start_date]
    );

    const days = daysResult.days;

    // Return annual balance

    await db.execute(
      `
      UPDATE leave_balances
      SET annual_used =
      GREATEST(annual_used - ?,0)
      WHERE user_id=?
      `,
      [days, leave.user_id]
    );

    // Return leave type balance

    if (leave.leave_type === "casual") {

      await db.execute(
        `
        UPDATE leave_balances
        SET casual_used=
        GREATEST(casual_used-?,0)
        WHERE user_id=?
        `,
        [days, leave.user_id]
      );

    }

    if (leave.leave_type === "sick") {

      await db.execute(
        `
        UPDATE leave_balances
        SET sick_used=
        GREATEST(sick_used-?,0)
        WHERE user_id=?
        `,
        [days, leave.user_id]
      );

    }

    // Change status back

    await db.execute(
      `
      UPDATE leaves
      SET status='pending'
      WHERE id=?
      `,
      [leaveId]
    );

    res.json({
      message:"Leave reverted to pending"
    });

  } catch(err){

    console.log(err);

    res.status(500).json({
      error:err.message
    });

  }

};