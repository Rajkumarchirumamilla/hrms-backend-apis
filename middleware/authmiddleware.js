const jwt = require("jsonwebtoken");

module.exports.verifyToken = (req, res, next) => {
  try {
    let token = req.headers.authorization;
    console.log('token', token);

    if (!token) {
      return res.status(401).json({ message: "Access denied. No token provided." });
    }

    if (token.startsWith("Bearer ")) {
      token = token.slice(7);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Validate that decoded contains required fields
    if (!decoded.role) {
      return res.status(401).json({ message: "Invalid token: No role specified" });
    }
    
    if (!decoded.id && !decoded.userId) {
      return res.status(401).json({ message: "Invalid token: No user ID specified" });
    }

    req.user = decoded;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: "Invalid token" });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token expired" });
    }
    return res.status(500).json({ message: "Authentication error" });
  }
};