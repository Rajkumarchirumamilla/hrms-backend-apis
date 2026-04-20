require("./config/db");
require("dotenv").config();
require("./routes/attendanceRoutes")


const express = require("express");

const app = express();


app.use(express.json());

// Routes
app.use("/api/employees", require("./routes/employeeRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/attendance", require("./routes/attendanceRoutes"));





app.listen(5000, () => {
  console.log("Server running on port 5000");
});