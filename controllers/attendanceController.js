const db = require("../config/db");
const getDistance = require("../utils/distance");
const uploadToS3 = require("../utils/uploadToS3");


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
   console.log('checkin')

const [[emp]] = await db.execute(
        "SELECT id FROM employees WHERE user_id = ?",
        [userId]
      );

      const employee_id = emp.id;

    const imageUrl = req.file ? await uploadToS3(req.file) : null;

    db.query(
      `SELECT o.* FROM employees e 
       JOIN office_locations o ON e.office_id = o.id 
       WHERE e.id=?`,
      [employee_id],
      (err, result) => {
        if (!result || result.length === 0) {
          return res.status(400).json({ message: "Employee not linked to office" });
        }

        const office = result[0];

        const distance = getDistance(
          office.latitude,
          office.longitude,
          lat,
          lng
        );

        if (distance > office.radius) {
          return res.status(400).json({ message: "Outside office" });
        }

        const id = "a" + Date.now();

        db.query(
          `INSERT INTO attendance 
          (id, employee_id, check_in, checkin_image, checkin_lat, checkin_lng, last_active_time)
          VALUES (?, ?, NOW(), ?, ?, ?, NOW())`,
          [id, employee_id, imageUrl, lat, lng],
          (err) => {
            if (err) return res.status(500).json(err);

            res.json({ message: "Checked-in Sucessfully", attendance_id: id });
          }
        );
      }
    );
  } catch (err) {
    res.status(500).json(err);
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

    const imageUrl = req.file ? await uploadToS3(req.file) : null;

    db.query(
      "SELECT * FROM attendance WHERE id=?",
      [attendance_id],
      (err, result) => {
        if (err) return res.status(500).json(err);

        if (!result || result.length === 0) {
          return res.status(400).json({ message: "Invalid attendance" });
        }

        const data = result[0];

        const now = new Date();

        const lastActive = data.last_active_time
          ? new Date(data.last_active_time)
          : new Date(data.check_in);

        const previous = data.total_working_hours || 0;

        const diff = (now - lastActive) / 1000;

        const totalTime = previous + diff;
        

        db.query(
          `UPDATE attendance 
           SET check_out = NOW(),
               checkout_image = ?,
               checkout_lat = ?,
               checkout_lng = ?,
               total_working_hours = ?,
               status = 'completed'
           WHERE id=?`,
          [imageUrl, lat, lng, totalTime, attendance_id],
          (err) => {
            if (err) return res.status(500).json(err);

            res.json({
              message: "Checked-out Sucessfully",
              total_hours: formatTime(totalTime)
            });
          }
        );
      }
    );
  } catch (err) {
    res.status(500).json(err);
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