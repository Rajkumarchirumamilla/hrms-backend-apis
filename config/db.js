const mysql = require('mysql2/promise'); 
require('dotenv').config();

const pool = mysql.createPool({
   host: "database-1.cz2ke2m6cl7t.ap-southeast-2.rds.amazonaws.com",
  user: "admin",
  password: "raj955009",
  database: "HRMS_DB",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("MySQL Connected");
    connection.release();
  } catch (err) {
    console.error("DB Connection Error:", err);
  }
})();

module.exports = pool;