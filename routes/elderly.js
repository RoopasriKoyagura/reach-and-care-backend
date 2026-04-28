const express = require('express');
const router = express.Router();
const Elderly = require('../models/Elderly');
const emailService = require('../services/emailService');
const { protect, adminOnly } = require('../middleware/auth');

/**
 * POST /api/elderly/register
 * Register an elderly person (done by family member)
 * Public route
 */
router.post('/register', async (req, res) => {
  try {
    const {
      fullName, age, gender, phone, alternatePhone,
      address, healthIssues, medications, bloodGroup,
      doctorName, doctorPhone, hospitalName,
      registeredBy, latitude, longitude,
    } = req.body;

    // Check duplicate phone
    const existing = await Elderly.findOne({ phone });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'ఈ ఫోన్ నంబర్ ఇప్పటికే నమోదు చేయబడింది.',
      });
    }

    const elderly = new Elderly({
      fullName,
      age,
      gender,
      phone,
      alternatePhone,
      address,
      healthIssues: Array.isArray(healthIssues) ? healthIssues : [healthIssues].filter(Boolean),
      medications: Array.isArray(medications) ? medications : [medications].filter(Boolean),
      bloodGroup,
      doctorName,
      doctorPhone,
      hospitalName,
      registeredBy,
      helplineNumber: process.env.TWILIO_HELPLINE_NUMBER,
      location: {
        type: 'Point',
        coordinates: [
          parseFloat(longitude) || 78.4867, // Default: Hyderabad
          parseFloat(latitude) || 17.3850,
        ],
      },
    });

    await elderly.save();

    // Send welcome email to family
    if (registeredBy.email) {
      await emailService.sendWelcomeEmail(registeredBy, elderly);
    }

    res.status(201).json({
      success: true,
      message: 'నమోదు విజయవంతమైంది!',
      data: {
        id: elderly._id,
        fullName: elderly.fullName,
        helplineNumber: process.env.TWILIO_HELPLINE_NUMBER,
        instructions: {
          '1': 'అత్యవసర సహాయం కోసం 1 నొక్కండి',
          '2': 'మందుల సహాయం కోసం 2 నొక్కండి',
          '3': 'నిత్యావసరాల కోసం 3 నొక్కండి',
        },
      },
    });
  } catch (error) {
    console.error('Elderly registration error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * GET /api/elderly/:id
 * Get elderly details (for volunteer after accepting)
 * Protected - only logged in volunteers
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const elderly = await Elderly.findById(req.params.id);
    if (!elderly) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    res.json({ success: true, data: elderly });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/elderly
 * Get all elderly (admin only)
 */
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await Elderly.countDocuments();
    const elderly = await Elderly.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: elderly,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/elderly/:id
 * Update elderly profile (admin or family)
 */
router.put('/:id', protect, async (req, res) => {
  try {
    const elderly = await Elderly.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!elderly) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    res.json({ success: true, data: elderly });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
