const db = require("../config/db");
const getDistance = require("../utils/distance");
const uploadToS3 = require("../utils/uploadToS3");
const faceapi = require('face-api.js');
const canvas = require('canvas');
const path = require('path');
const AttendanceCalculator = require("../utils/attendanceCalculator");


const loadFaceModels = async () => {
  const modelPath = path.join(__dirname, '../models');
  await faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
};


const validateFaceInImage = async (imageBuffer) => {
  try {
    const img = await canvas.loadImage(imageBuffer);
    const detections = await faceapi
      .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();

    if (detections.length === 0) {
      return { valid: false, message: 'No face detected in image' };
    }

    if (detections.length > 1) {
      return { valid: false, message: 'Multiple faces detected. Please capture only your face.' };
    }

    const detection = detections[0];
    const landmarks = detection.landmarks;
    
    // Check if all key landmarks are detected (full face visibility)
    const requiredLandmarks = [
      landmarks.getLeftEye(),
      landmarks.getRightEye(),
      landmarks.getNose(),
      landmarks.getMouth(),
      landmarks.getJawOutline(),
    ];

    const hasAllLandmarks = requiredLandmarks.every(
      (landmark) => landmark && landmark.length > 0
    );

    if (!hasAllLandmarks) {
      return { valid: false, message: 'Face not fully visible. Please remove mask/glasses and try again.' };
    }

    // Check face is not too small (should be at least 30% of image)
    const box = detection.detection.box;
    const faceArea = box.width * box.height;
    const imageArea = img.width * img.height;
    const faceRatio = faceArea / imageArea;

    if (faceRatio < 0.15) {
      return { valid: false, message: 'Face too small. Move closer to camera.' };
    }

    if (faceRatio > 0.8) {
      return { valid: false, message: 'Face too close. Move back slightly.' };
    }

    return { valid: true, detection };
  } catch (error) {
    console.error('Face validation error:', error);
    return { valid: false, message: 'Failed to validate face' };
  }
};

function formatTime(seconds) {
  if (!seconds) return "00:00:00";

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (n) => n.toString().padStart(2, "0");

  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

exports.checkIn = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lat, lng } = req.body;
    const imageFile = req.file;

    console.log('imGE FILE',imageFile)

    if (lat == null || lng == null) {
      return res.status(400).json({ message: "Location required" });
    }

    const [[emp]] = await db.execute(
                                  `
                                  SELECT 
                                    id,
                                    organization_id,
                                    branch_id
                                  FROM employees
                                  WHERE user_id = ?
                                  `,
                                  [userId]
                                );

    if (!emp) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const employee_id = emp.id;

   const [[office]] = await db.execute(
`
SELECT *
FROM office_locations
WHERE organization_id = ?
AND branch_id = ?
`,
[
  emp.organization_id,
  emp.branch_id
]
);

if (!office) {
  return res.status(400).json({
    message: "Office not found for branch"
  });
}
    const distance = getDistance(
      office.latitude,
      office.longitude,
      lat,
      lng
    );

    // if (distance > office.radius + 20) {
    //   return res.status(400).json({
    //     message: "You are not in office location",
    //   });
    // }

    // ✅ SAFE IMAGE UPLOAD
          let imageUrl = null;
        if (imageFile) {
          try {
            imageUrl = await uploadToS3(imageFile);
          } catch (e) {
            console.log("S3 error:", e.message);
          }
        }
  
    const [[existing]] = await db.execute(
      `SELECT id FROM attendance 
       WHERE employee_id = ? AND DATE(check_in) = CURDATE()`,
      [employee_id]
    );

    if (existing) {
      return res.status(400).json({ message: "Already checked in today" });
    }

    // ✅ USE SAME TIME (IMPORTANT)
    const now = new Date();

    const [result] = await db.execute(
      `INSERT INTO attendance 
      (employee_id, check_in, checkin_image, checkin_lat, checkin_lng, last_active_time)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [employee_id, now, imageUrl, lat, lng, now]
    );

    // ✅ FINAL RESPONSE
    res.json({
      message: "Checked-in Successfully",
      attendance_id: result.insertId,
      check_in_time: now, // 🔥 FIXED
      distance: Math.round(distance) + " meters",
    });

  } catch (err) {
    console.log("Check-in error:", err.message);
    res.status(500).json({ error: err.message });
  }
};


exports.trackLocation = (req, res) => {
  const { attendance_id, lat, lng } = req.body;

  db.query(
    `SELECT a.*, o.latitude, o.longitude, o.radius
     FROM attendance a
     JOIN employees e ON a.employee_id = e.id
     JOIN office_locations o ON e.office_id = o.id
     WHERE a.id=?`,
    [attendance_id],
    (err, result) => {
      if (!result || result.length === 0) {
        return res.status(400).json({ message: "Invalid attendance" });
      }

      const data = result[0];

      const distance = getDistance(
        data.latitude,
        data.longitude,
        lat,
        lng
      );

      const now = new Date();

      let status = distance <= data.radius ? "inside" : "outside";

      // Save logs
      db.query(
        `INSERT INTO attendance_logs 
        (attendance_id, latitude, longitude, status) 
        VALUES (?, ?, ?, ?)`,
        [attendance_id, lat, lng, status]
      );

      if (status === "inside") {
        const lastActive = new Date(data.last_active_time);
        const diff = (now - lastActive) / 1000;

        const previous = data.total_working_hours || 0;

        db.query(
          `UPDATE attendance 
           SET total_working_hours = ?, 
               last_active_time = NOW(), 
               status='active'
           WHERE id=?`,
          [previous + diff, attendance_id]
        );
      } else {
        db.query(
          `UPDATE attendance 
           SET status='paused'
           WHERE id=?`,
          [attendance_id]
        );
      }

      res.json({ status });
    }
  );
};


exports.checkOut = async (req, res) => {
  try {
    const { attendance_id, lat, lng } = req.body;                                                                                                             
     const imageFile = req.file;  
      console.log('image file',imageFile)

    if (!attendance_id) {
      return res.status(400).json({ message: "attendance_id required" });
    }

    // ✅ Safe image upload
    let imageUrl = null;
    
       if (imageFile) {
      try {
        imageUrl = await uploadToS3(imageFile);
      } catch (e) {
        console.log("S3 error:", e.message);
      }
    }


    // ✅ Check attendance exists
    db.query(
      "SELECT id, check_in FROM attendance WHERE id = ?",
      [attendance_id],
      (err, result) => {
        if (err) return res.status(500).json(err);

        if (!result || result.length === 0) {
          return res.status(400).json({ message: "Invalid attendance" });
        }

        // ✅ Update using MySQL time calculation (BEST)
        db.query(
          `UPDATE attendance 
           SET check_out = NOW(),
               checkout_image = ?,
               checkout_lat = ?,
               checkout_lng = ?,
               working_hours = TIMESTAMPDIFF(SECOND, check_in, NOW()),
               status = 'completed'
           WHERE id = ?`,
          [imageUrl, lat, lng, attendance_id],
          (err) => {
            if (err) return res.status(500).json(err);

            // ✅ Fetch calculated working hours
            db.query(
              "SELECT working_hours FROM attendance WHERE id = ?",
              [attendance_id],
              (err, result2) => {
                if (err) return res.status(500).json(err);

                const seconds = result2[0].working_hours || 0;

                // ✅ Format function
                const formatTime = (sec) => {
                  const hrs = Math.floor(sec / 3600);
                  const mins = Math.floor((sec % 3600) / 60);
                  const secs = Math.floor(sec % 60);
                  return `${hrs}h ${mins}m ${secs}s`;
                };

                res.json({
                  message: "Checked-out Successfully",
                  total_seconds: seconds,
                  total_hours: formatTime(seconds),
                });
              }
            );
          }
        );
      }
    );
  } catch (err) {
    console.log("Checkout error:", err.message);
    res.status(500).json({ error: err.message });
  }
};


exports.getAttendance = (req, res) => {
  const { employee_id } = req.params;

  db.query(
    "SELECT * FROM attendance WHERE employee_id=?",
    [employee_id],
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.json(
        result.map((row) => ({
          ...row,
          total_working_hours: formatTime(row.total_working_hours)
        }))
      );
    }
  );
};


exports.updateAttendance = (req, res) => {
  const { id } = req.params;
  const { check_in, check_out } = req.body;

  db.query(
    "UPDATE attendance SET check_in=?, check_out=? WHERE id=?",
    [check_in, check_out, id],
    () => res.json({ message: "Updated Successfully" })
  );
};


exports.deleteAttendance = (req, res) => {
  const { id } = req.params;

  db.query(
    "DELETE FROM attendance WHERE id=?",
    [id],
    () => res.json({ message: "Deleted Successfully" })
  );
};


// POST /attendance/auto-checkout
exports.autoCheckOut = async (req, res) => {
  try {
    const userId = req.user.id;

    const [[emp]] = await db.execute(
      "SELECT id FROM employees WHERE user_id = ?",
      [userId]
    );
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const [[attendance]] = await db.execute(
      `SELECT * FROM attendance 
       WHERE employee_id = ? AND check_out IS NULL
       ORDER BY check_in DESC LIMIT 1`,
      [emp.id]
    );

    if (!attendance) {
      return res.status(400).json({ message: "No active session" });
    }

    const checkInTime = new Date(attendance.check_in);
    const now = new Date();
    
    // Calculate total working seconds properly
    const lastActive = attendance.last_active_time 
      ? new Date(attendance.last_active_time) 
      : checkInTime;
    const previous = attendance.working_hours || 0;
    const diff = (now - lastActive) / 1000;
    const totalTime = previous + diff;

    await db.execute(
      `UPDATE attendance 
       SET check_out = NOW(), 
           working_hours = ?,
           status = 'completed'
       WHERE id = ?`,
      [totalTime, attendance.id]
    );

    res.json({
      message: "Auto checked-out",
      total_hours: formatTime(totalTime)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// POST /attendance/check-location
exports.checkLocation = async (req, res) => {
  try {
    console.log('check location')
    const userId = req.user.id;
    const { lat, lng } = req.body;

   const [[emp]] = await db.execute(
          `
          SELECT
          id,
          organization_id,
          branch_id
          FROM employees
          WHERE user_id=?
          `,
          [userId]
          );

    if (!emp || !emp.office_id) {
      return res.status(400).json({ message: "Employee not linked to office" });
    }

   const [[office]] = await db.execute(
                                    `
                                    SELECT *
                                    FROM office_locations
                                    WHERE organization_id=?
                                    AND branch_id=?
                                    `,
                                    [
                                    emp.organization_id,
                                    emp.branch_id
                                    ]
                                    );

    if (!office) {
      return res.status(400).json({ message: "Office location not found" });
    }

    const distance = getDistance(
      office.latitude,
      office.longitude,
      lat,
      lng
    );

    if (distance > office.radius + 20) {
      return res.json({ outside: true, distance: Math.round(distance) });
    }

    res.json({ outside: false, distance: Math.round(distance) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTodayAttendance = async (req, res) => {
  try {
    const userId = req.user.id;

    const [[emp]] = await db.execute(
      "SELECT id FROM employees WHERE user_id = ?",
      [userId]
    );
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    // Get the open session (not checked out)
    const [[attendance]] = await db.execute(
      `SELECT * FROM attendance 
       WHERE employee_id = ? AND check_out IS NULL
       ORDER BY check_in DESC LIMIT 1`,
      [emp.id]
    );

    if (!attendance) {
      return res.json({ checkedIn: false, attendance: null });
    }

    res.json({
      checkedIn: true,
      attendance: {
        id: attendance.id,
        checkInTime: attendance.check_in,
        checkInLat: attendance.checkin_lat,
        checkInLng: attendance.checkin_lng,
        totalWorkingSeconds: attendance.total_working_hours || 0,
        status: attendance.status,
        lastActiveTime: attendance.last_active_time,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



exports.startBreak = async (req, res) => {
  const { attendance_id } = req.body;

  await db.execute(
    `UPDATE attendance 
     SET break_start = NOW(), is_on_break = 1
     WHERE id = ?`,
    [attendance_id]
  );

  res.json({ message: "Break started" });
};


exports.endBreak = async (req, res) => {
  try {
    const { attendance_id } = req.body;

    const [[row]] = await db.execute(
      `SELECT break_start, total_break_seconds 
       FROM attendance 
       WHERE id = ?`,
      [attendance_id]
    );

    // ❌ If no break started → ignore
    if (!row.break_start) {
      return res.json({ message: "No active break" });
    }

    // ✅ MySQL handles time (NO JS DATE)
    const [[result]] = await db.execute(
      `SELECT TIMESTAMPDIFF(SECOND, break_start, NOW()) AS diff`,
      []
    );

    const diff = result.diff || 0;

    const totalBreak = (row.total_break_seconds || 0) + diff;

    await db.execute(
  `UPDATE attendance 
   SET total_break_seconds = ?, 
       break_start = NULL,    
       is_on_break = 0         
        WHERE id = ?`,
        [totalBreak, attendance_id]
      );

    res.json({
      message: "Break ended",
      break_seconds: totalBreak,
    });

  } catch (err) {
    console.log("Break error:", err.message);
    res.status(500).json({ error: err.message });
  }
};



// GET /attendance/dashboard - Fetch complete attendance dashboard data
exports.getAttendanceDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { month, year } = req.query;

    const [[emp]] = await db.execute(
      "SELECT id, organization_id,branch_id FROM employees WHERE user_id = ?",
      [userId]
    );

    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const employee_id = emp.id;

    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();

    // 1. Today's attendance (unchanged)
    const [[todayAttendance]] = await db.execute(
      `SELECT id, check_in, check_out, checkin_image, checkin_lat, checkin_lng,
              working_hours, status, last_active_time, break_start, is_on_break
       FROM attendance 
       WHERE employee_id = ? AND DATE(check_in) = CURDATE()`,
      [employee_id]
    );

    const isCheckedIn = !!todayAttendance && !todayAttendance.check_out;
    const checkInTime = todayAttendance ? formatTimeForDisplay(todayAttendance.check_in) : null;

    // 2. Monthly statistics (FIXED: handle NULL check_in for absent records)
    const [[monthStats]] = await db.execute(
      `SELECT 
        COUNT(*) as total_days,
        SUM(CASE WHEN check_in IS NOT NULL AND check_out IS NOT NULL THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN check_in IS NOT NULL AND TIME(check_in) > '09:30:00' THEN 1 ELSE 0 END) as late,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'holiday' THEN 1 ELSE 0 END) as holiday,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave_count
       FROM attendance 
       WHERE employee_id = ? 
       AND (
         (check_in IS NOT NULL AND MONTH(check_in) = ? AND YEAR(check_in) = ?)
         OR 
         (check_in IS NULL AND status = 'absent' AND MONTH(created_at) = ? AND YEAR(created_at) = ?)
       )`,
      [employee_id, targetMonth, targetYear, targetMonth, targetYear]
    );

    // 3. Attendance history (FIXED: added month/year filter for non-null check_in)
    const [history] = await db.execute(
      `SELECT 
        id,
        DATE(check_in) as date,
        DATE_FORMAT(check_in, '%b %d, %Y') as formatted_date,
        TIME(check_in) as check_in_time,
        TIME(check_out) as check_out_time,
        working_hours,
        status,
        CASE 
          WHEN check_in IS NULL THEN 'absent'
          WHEN TIME(check_in) > '09:30:00' THEN 'late'
          WHEN status = 'holiday' THEN 'holiday'
          ELSE 'present'
        END as calculated_status
       FROM attendance 
       WHERE employee_id = ? 
       AND check_in IS NOT NULL
       AND MONTH(check_in) = ? 
       AND YEAR(check_in) = ?
       ORDER BY check_in DESC 
       LIMIT 30`,
      [employee_id, targetMonth, targetYear]
    );

    const formattedHistory = history.map(record => ({
      id: record.id.toString(),
      date: record.formatted_date,
      checkIn: record.check_in_time ? formatTime12Hour(record.check_in_time) : null,
      checkOut: record.check_out_time ? formatTime12Hour(record.check_out_time) : null,
      status: record.calculated_status,
      hours: record.working_hours ? formatDuration(record.working_hours) : '-'
    }));

    const stats = {
      present: monthStats?.present || 0,
      late: monthStats?.late || 0,
      absent: monthStats?.absent || 0,
      leave: monthStats?.leave_count || 0
    };

    res.json({
      today: {
        isCheckedIn,
        checkInTime,
        attendanceId: todayAttendance?.id || null,
        status: todayAttendance?.status || null,
        lastActiveTime: todayAttendance?.last_active_time || null,
        isOnBreak: todayAttendance?.is_on_break === 1
      },
      stats,
      history: formattedHistory,
      month: targetMonth,
      year: targetYear
    });

  } catch (err) {
    console.error("Dashboard error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Helper functions
function formatTime12Hour(timeStr) {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function formatTimeForDisplay(date) {
  if (!date) return null;
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatDuration(seconds) {
  if (!seconds) return '-';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
}



// ============================================
// GET ATTENDANCE DATA FOR PAYROLL STEP 2
// ============================================
exports.getAttendanceForPayroll = async (req, res) => {
    const { batchId } = req.params;
    const { month, year } = req.query;

    try {
        // Get batch info
        const [batch] = await db.query(
            'SELECT * FROM payroll_batches WHERE id = ?',
            [batchId]
        );

        if (batch.length === 0) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }

        const targetMonth = month || batch[0].month;
        const targetYear = year || batch[0].year;

        // Get all employees in the batch with their salary structures
        const [employees] = await db.query(
            `SELECT 
                pe.*,
                e.id as employee_id,
                u.name as employee_name,
                e.employee_code,
                pe.gross_salary,
                pe.net_salary
            FROM payroll_employees pe
            JOIN employees e ON pe.employee_id = e.id
            JOIN users u ON e.user_id = u.id
            WHERE pe.payroll_batch_id = ?`,
            [batchId]
        );

        const attendanceCalculator = new AttendanceCalculator();
        const results = [];

        for (const employee of employees) {
          const startDate = `${targetYear}-${getMonthNumber(targetMonth)}-01`;

                const endDate =
                `${targetYear}-${getMonthNumber(targetMonth)}-${getDaysInMonth(
                targetMonth,
                targetYear
                )}`;

            const [attendanceRecords] = await db.query(
                `SELECT * FROM attendance 
                 WHERE employee_id = ? 
                 AND DATE(check_in) BETWEEN ? AND ?
                 AND status = 'completed'
                 ORDER BY check_in ASC`,
                [employee.employee_id, startDate, endDate]
            );

            // Calculate daily wage
            const dailyWage = attendanceCalculator.calculateDailyWage(employee.gross_salary);
            
            // Calculate attendance summary
            const summary = attendanceCalculator.calculateMonthlyAttendance(attendanceRecords, dailyWage);

            results.push({
                ...employee,
                attendance_summary: summary,
                daily_wage_rate: dailyWage,
                attendance_records: attendanceRecords.map(record => ({
                    date: new Date(record.check_in).toLocaleDateString(),
                    check_in: record.check_in,
                    check_out: record.check_out,
                    working_hours: record.working_hours,
                    status: record.status
                }))
            });
        }

        // Calculate department-wise totals
        const [departmentTotals] = await db.query(
            `SELECT 
                d.name as department_name,
                COUNT(DISTINCT e.id) as employee_count,
                SUM(pe.gross_salary) as total_gross
            FROM payroll_employees pe
            JOIN employees e ON pe.employee_id = e.id
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE pe.payroll_batch_id = ?
            GROUP BY d.id`,
            [batchId]
        );

        res.json({
            success: true,
            data: {
                employees: results,
                summary: {
                    total_employees: results.length,
                    total_lop_days: results.reduce((sum, emp) => sum + emp.attendance_summary.lopDays, 0),
                    total_lop_amount: results.reduce((sum, emp) => sum + emp.attendance_summary.lopAmount, 0),
                    total_overtime_hours: results.reduce((sum, emp) => sum + emp.attendance_summary.overtimeHours, 0),
                    total_overtime_amount: results.reduce((sum, emp) => sum + emp.attendance_summary.overtimeAmount, 0),
                    department_breakdown: departmentTotals
                },
                month: targetMonth,
                year: targetYear
            }
        });

    } catch (error) {
        console.error('Error fetching attendance for payroll:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// UPDATE ATTENDANCE FOR PAYROLL
// ============================================
exports.updateAttendanceForPayroll = async (req, res) => {
    const { batchId, employeeId } = req.params;
    const { 
        lop_days, 
        lop_amount,
        overtime_days,
        overtime_amount,
        late_days,
        late_deducted_hours,
        early_out_days,
        early_out_deducted_hours,
        total_days_deducted,
        manual_override 
    } = req.body;

    try {
        // Update payroll_employees table with attendance adjustments
        await db.query(
            `UPDATE payroll_employees 
             SET lop_days = ?,
                 loss_of_pay = ?,
                 step2_attendance_approved = FALSE,
                 attendance_data = JSON_MERGE_PATCH(
                     COALESCE(attendance_data, '{}'),
                     JSON_OBJECT(
                         'lop_days', ?,
                         'lop_amount', ?,
                         'overtime_days', ?,
                         'overtime_amount', ?,
                         'late_days', ?,
                         'late_deducted_hours', ?,
                         'early_out_days', ?,
                         'early_out_deducted_hours', ?,
                         'total_days_deducted', ?,
                         'manual_override', ?,
                         'updated_at', NOW()
                     )
                 )
             WHERE payroll_batch_id = ? AND employee_id = ?`,
            [
                lop_days || 0,
                lop_amount || 0,
                lop_days || 0,
                lop_amount || 0,
                overtime_days || 0,
                overtime_amount || 0,
                late_days || 0,
                late_deducted_hours || 0,
                early_out_days || 0,
                early_out_deducted_hours || 0,
                total_days_deducted || 0,
                manual_override || false,
                batchId,
                employeeId
            ]
        );

        // Recalculate net salary with attendance adjustments
        const [employee] = await db.query(
            `SELECT gross_salary, total_deductions, loss_of_pay 
             FROM payroll_employees 
             WHERE payroll_batch_id = ? AND employee_id = ?`,
            [batchId, employeeId]
        );

        if (employee.length > 0) {
            const netSalary = employee[0].gross_salary - employee[0].total_deductions - (lop_amount || 0) + (overtime_amount || 0);
            await db.query(
                `UPDATE payroll_employees SET net_salary = ? 
                 WHERE payroll_batch_id = ? AND employee_id = ?`,
                [netSalary, batchId, employeeId]
            );
        }

        res.json({ 
            success: true, 
            message: 'Attendance updated successfully',
            data: {
                lop_days: lop_days || 0,
                lop_amount: lop_amount || 0,
                overtime_amount: overtime_amount || 0,
                net_salary: employee[0].gross_salary - employee[0].total_deductions - (lop_amount || 0) + (overtime_amount || 0)
            }
        });

    } catch (error) {
        console.error('Error updating attendance:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================
// BULK UPDATE ATTENDANCE
// ============================================
exports.bulkUpdateAttendance = async (req, res) => {
    const { batchId } = req.params;
    const { updates } = req.body; // Array of {employee_id, lop_days, overtime_hours, etc.}

    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        for (const update of updates) {
            await connection.query(
                `UPDATE payroll_employees 
                 SET lop_days = ?,
                     loss_of_pay = ?,
                     step2_attendance_approved = FALSE
                 WHERE payroll_batch_id = ? AND employee_id = ?`,
                [update.lop_days, update.lop_amount, batchId, update.employee_id]
            );
        }

        await connection.commit();
        
        res.json({ 
            success: true, 
            message: `Updated ${updates.length} employees successfully` 
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error bulk updating attendance:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

// Helper function
function getMonthNumber(month) {
    const months = {
        'January': '01', 'February': '02', 'March': '03', 'April': '04',
        'May': '05', 'June': '06', 'July': '07', 'August': '08',
        'September': '09', 'October': '10', 'November': '11', 'December': '12'
    };
    return months[month];
}

function getDaysInMonth(month, year) {
    return new Date(year, getMonthNumber(month), 0).getDate();
}