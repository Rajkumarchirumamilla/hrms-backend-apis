require("./config/db");
require("dotenv").config();
require("./routes/attendanceRoutes")
const cors = require('cors');

const express = require("express");

const app = express();

// require('./cron/attendanceCron');

app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(cors());

app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use("/api/employees", require("./routes/employeeRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/attendance", require("./routes/attendanceRoutes"));
app.use('/api/leaves', require('./routes/leaveRoutes'))
app.use('/api/payslips',require('./routes/payrollRoutes'))
app.use('/api/departments',require("./routes/department"))
app.use('/api/designation',require('./routes/designationRoutes'))
app.use('/api/branches',require('./routes/branchRoutes'))
// ADD THIS - Face detection route
app.use('/api/face', require('./routes/faceDetectionRoutes'));
app.use('/api/organizations',require('./routes/organizationRoutes'))
app.use('/api/payroll',require('./routes/payrollRoutes'))



const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});