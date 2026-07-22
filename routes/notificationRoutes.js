const db = require("../config/db");

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.execute(
      `SELECT *
       FROM notifications
       WHERE receiver_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {

    await db.execute(
      `UPDATE notifications
       SET is_read = 1
       WHERE id = ?`,
      [req.params.id]
    );

    res.json({
      message: "Notification marked as read"
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
};