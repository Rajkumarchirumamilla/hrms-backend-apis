const jwt = require("jsonwebtoken");

module.exports.auth = (req, res, next) => {
  try {
    let token = req.headers.authorization;

    if (!token) {
      return res.status(400).json({ message: "Access denied" });
    }

    if (token.startsWith("Bearer ")) {
      token = token.slice(7); 
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();

  } catch {
    return res.status(400).json({ message: "Invalid or expired token" });
  }
};