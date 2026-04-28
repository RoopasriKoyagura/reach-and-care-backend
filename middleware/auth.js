const jwt = require('jsonwebtoken');
const Volunteer = require('../models/Volunteer');
const Admin = require('../models/Admin');

// Protect routes — verifies JWT token
exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized. Please login.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token invalid or expired.' });
  }
};

// Volunteer only
exports.volunteerOnly = async (req, res, next) => {
  if (req.user.role !== 'volunteer') {
    return res.status(403).json({ success: false, message: 'Access restricted to volunteers.' });
  }
  next();
};

// Admin only
exports.adminOnly = async (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Access restricted to admins.' });
  }
  next();
};

// Generate JWT token
exports.generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};
