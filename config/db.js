const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "database-1.cz2ke2m6cl7t.ap-southeast-2.rds.amazonaws.com",
  user: "admin",
  password: "raj955009",
  database: "HRMS_DB",
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0
});

db.connect(err => {
  if (err) throw err;
  console.log("MySQL Connected");
});

module.exports = db;