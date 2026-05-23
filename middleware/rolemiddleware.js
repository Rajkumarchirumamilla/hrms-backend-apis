// Make sure the function name matches what you're using in routes
exports.checkRole = (...roles) => {
  return (req, res, next) => {
    console.log('check middle ware')
    // Check if user exists (set by verifyToken)
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' }); 
    }
    console.log('user',req.user)
    
    // Check if user has required role
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Forbidden: Insufficient permissions',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }
    
    next();
  };
};

// Keep allowRoles as an alias if you prefer
exports.allowRoles = exports.checkRole;