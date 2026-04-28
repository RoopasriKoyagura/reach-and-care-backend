const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const Volunteer = require('../models/Volunteer');
const { protect, adminOnly, generateToken } = require('../middleware/auth');

/**
 * POST /api/admin/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email }).select('+password');

    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'తప్పు credentials.' });
    }

    const token = generateToken(admin._id, admin.role);
    res.json({
      success: true,
      token,
      data: { id: admin._id, name: admin.name, role: admin.role },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/admin/setup
 * Create first admin (run once, then disable this route!)
 * Protected by secret key in body
 */
router.post('/setup', async (req, res) => {
  try {
    const { name, email, password, setupKey } = req.body;

    if (setupKey !== process.env.JWT_SECRET) {
      return res.status(403).json({ success: false, message: 'Invalid setup key' });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Admin already exists' });
    }

    const admin = new Admin({ name, email, password, role: 'superadmin' });
    await admin.save();

    res.json({ success: true, message: 'Admin created', data: { id: admin._id } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/volunteers/pending
 * Get all volunteers pending verification
 */
router.get('/volunteers/pending', protect, adminOnly, async (req, res) => {
  try {
    const volunteers = await Volunteer.find({ verificationStatus: 'pending' })
      .sort({ createdAt: -1 });
    res.json({ success: true, data: volunteers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/admin/volunteers/:id/approve
 * Approve a volunteer
 */
router.put('/volunteers/:id/approve', protect, adminOnly, async (req, res) => {
  try {
    const volunteer = await Volunteer.findByIdAndUpdate(
      req.params.id,
      { verificationStatus: 'approved', isVerified: true },
      { new: true }
    );

    if (!volunteer) {
      return res.status(404).json({ success: false, message: 'Volunteer not found' });
    }

    // Notify volunteer
    const { sendEmail } = require('../services/emailService');
    // Send approval email (simplified)

    res.json({ success: true, message: 'Volunteer approved', data: volunteer });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/admin/volunteers/:id/reject
 * Reject a volunteer
 */
router.put('/volunteers/:id/reject', protect, adminOnly, async (req, res) => {
  try {
    const volunteer = await Volunteer.findByIdAndUpdate(
      req.params.id,
      { verificationStatus: 'rejected', isVerified: false },
      { new: true }
    );

    if (!volunteer) {
      return res.status(404).json({ success: false, message: 'Volunteer not found' });
    }

    res.json({ success: true, message: 'Volunteer rejected', data: volunteer });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/volunteers
 * Get all volunteers
 */
router.get('/volunteers', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { verificationStatus: status } : {};
    const volunteers = await Volunteer.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: volunteers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
