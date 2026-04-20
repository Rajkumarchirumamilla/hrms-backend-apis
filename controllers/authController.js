const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');


exports.register = async (req, res) => {
  try {
    const { mobilenumber, password, name, roleName } = req.body;

    if (!mobilenumber || !password || !name) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const hash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    await db.execute(
      'INSERT INTO users (id, mobilenumber, password, name, status) VALUES (?, ?, ?, ?, ?)',
      [userId, mobilenumber, hash, name, 'Active']
    );
 
    const [roleRows] = await db.execute(
      'SELECT id FROM roles WHERE name = ?',
      [roleName || 'EMPLOYE']
    );

    if (!roleRows.length) {
      return res.status(400).json({ message: 'Role not found' });
    }
   
    await db.execute(
      'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [userId, roleRows[0].id]
    );

    res.status(200).json({
      message: 'User created successfully',
      userId
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