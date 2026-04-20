const db = require('../config/db');

exports.getAllUsers = async (req, res) => {
  const [users] = await db.execute(
    'SELECT id, mobilenumber, status FROM users'
  );
  res.json(users);
};

exports.getUser = async (req, res) => {
  const [user] = await db.execute(
    'SELECT id, mobilenumber, status FROM users WHERE id=?',
    [req.params.id]
  );
  res.json(user[0]);
};

exports.updateUser = async (req, res) => {
  const { status } = req.body;

  await db.execute(
    'UPDATE users SET status=? WHERE id=?',
    [status, req.params.id]
  );

  res.json({ message: 'Sucessfully Updated' });
};

exports.deleteUser = async (req, res) => {
  await db.execute('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ message: 'Deleted' });
};