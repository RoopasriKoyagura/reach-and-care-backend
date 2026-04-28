const express = require('express');
const router = express.Router();
const Volunteer = require('../models/Volunteer');
const HelpRequest = require('../models/HelpRequest');
const emailService = require('../services/emailService');
const twilioService = require('../services/twilioService');
const { protect, volunteerOnly, generateToken } = require('../middleware/auth');

/**
 * POST /api/volunteers/register
 * Register as a volunteer
 */
router.post('/register', async (req, res) => {
  try {
    const { fullName, age, gender, phone, email, password, address,
            skills, idProofType, idProofNumber, latitude, longitude } = req.body;

    // Check duplicates
    const existing = await Volunteer.findOne({ $or: [{ phone }, { email }] });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'ఈ ఫోన్ లేదా ఇమెయిల్ ఇప్పటికే నమోదు చేయబడింది.',
      });
    }

    const volunteer = new Volunteer({
      fullName, age, gender, phone, email, password, address,
      skills: Array.isArray(skills) ? skills : [skills].filter(Boolean),
      idProofType, idProofNumber,
      location: {
        type: 'Point',
        coordinates: [
          parseFloat(longitude) || 78.4867,
          parseFloat(latitude) || 17.3850,
        ],
      },
    });

    await volunteer.save();

    // Send welcome email
    await emailService.sendVolunteerWelcomeEmail(volunteer);

    res.status(201).json({
      success: true,
      message: 'దరఖాస్తు అందుకున్నాం. Admin approval తర్వాత activate అవుతుంది.',
      data: { id: volunteer._id, fullName: volunteer.fullName, status: volunteer.verificationStatus },
    });
  } catch (error) {
    console.error('Volunteer registration error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * POST /api/volunteers/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const volunteer = await Volunteer.findOne({ email }).select('+password');
    if (!volunteer || !(await volunteer.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'తప్పు ఇమెయిల్ లేదా పాస్‌వర్డ్.' });
    }

    if (volunteer.verificationStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'మీ ఖాతా ఇంకా approve కాలేదు. Admin approval కోసం వేచి ఉండండి.',
      });
    }

    const token = generateToken(volunteer._id, 'volunteer');

    res.json({
      success: true,
      token,
      data: {
        id: volunteer._id,
        fullName: volunteer.fullName,
        phone: volunteer.phone,
        isAvailable: volunteer.isAvailable,
        rating: volunteer.rating,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/volunteers/profile
 * Get own profile
 */
router.get('/profile', protect, volunteerOnly, async (req, res) => {
  try {
    const volunteer = await Volunteer.findById(req.user.id)
      .populate('currentRequest');
    res.json({ success: true, data: volunteer });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/volunteers/availability
 * Toggle availability (online/offline)
 */
router.put('/availability', protect, volunteerOnly, async (req, res) => {
  try {
    const { isAvailable, latitude, longitude } = req.body;
    const update = { isAvailable };

    // Update location when coming online
    if (isAvailable && latitude && longitude) {
      update.location = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    }

    const volunteer = await Volunteer.findByIdAndUpdate(req.user.id, update, { new: true });
    res.json({ success: true, data: { isAvailable: volunteer.isAvailable } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/volunteers/accept/:requestId
 * Volunteer accepts a help request
 */
router.post('/accept/:requestId', protect, volunteerOnly, async (req, res) => {
  try {
    const helpRequest = await HelpRequest.findById(req.params.requestId)
      .populate('elderly');

    if (!helpRequest) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    if (helpRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'ఈ request ఇప్పటికే మరొకరు తీసుకున్నారు.',
      });
    }

    const volunteer = await Volunteer.findById(req.user.id);
    if (volunteer.currentRequest) {
      return res.status(400).json({
        success: false,
        message: 'మీరు ఇప్పటికే మరొక request లో ఉన్నారు.',
      });
    }

    // Assign volunteer to request
    helpRequest.status = 'accepted';
    helpRequest.volunteer = volunteer._id;
    helpRequest.acceptedAt = new Date();
    await helpRequest.save();

    // Mark volunteer as busy
    volunteer.currentRequest = helpRequest._id;
    volunteer.isAvailable = false;
    await volunteer.save();

    // Send elderly full details to volunteer via SMS
    await twilioService.sendElderlyDetailsToVolunteer(volunteer, helpRequest.elderly, helpRequest);

    // Notify other volunteers that request is taken (via socket)
    const io = req.app.get('io');
    if (io) {
      helpRequest.notifiedVolunteers.forEach((vid) => {
        io.to(`volunteer_${vid}`).emit('request_taken', {
          requestId: helpRequest._id,
        });
      });
    }

    res.json({
      success: true,
      message: 'Request accept చేశారు. వివరాలు SMS లో పంపబడ్డాయి.',
      data: {
        requestId: helpRequest._id,
        elderly: {
          fullName: helpRequest.elderly.fullName,
          phone: helpRequest.elderly.phone,
          address: helpRequest.elderly.address,
          healthIssues: helpRequest.elderly.healthIssues,
          bloodGroup: helpRequest.elderly.bloodGroup,
          registeredBy: helpRequest.elderly.registeredBy,
        },
      },
    });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/volunteers/decline/:requestId
 * Volunteer declines a help request
 */
router.post('/decline/:requestId', protect, volunteerOnly, async (req, res) => {
  try {
    const helpRequest = await HelpRequest.findById(req.params.requestId);
    if (!helpRequest) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    helpRequest.declinedByVolunteers.push(req.user.id);
    await helpRequest.save();

    res.json({ success: true, message: 'Declined' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/volunteers/arrived/:requestId
 * Volunteer marks they have arrived at elderly location
 */
router.post('/arrived/:requestId', protect, volunteerOnly, async (req, res) => {
  try {
    const helpRequest = await HelpRequest.findById(req.params.requestId);
    if (!helpRequest || helpRequest.volunteer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    helpRequest.status = 'in_progress';
    helpRequest.arrivedAt = new Date();
    await helpRequest.save();

    res.json({ success: true, message: 'Arrival marked' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/volunteers/generate-otp/:requestId
 * Generate OTP when volunteer is about to complete the task
 */
router.post('/generate-otp/:requestId', protect, volunteerOnly, async (req, res) => {
  try {
    const helpRequest = await HelpRequest.findById(req.params.requestId)
      .populate('elderly');

    if (!helpRequest || helpRequest.volunteer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    helpRequest.completionOtp = otp;
    helpRequest.otpGeneratedAt = new Date();
    await helpRequest.save();

    // Send OTP via SMS to volunteer (they show it to elderly/family)
    await twilioService.sendOtpSms(req.user.phone || helpRequest.elderly.registeredBy.phone, otp);

    // Also send to family
    if (helpRequest.elderly.registeredBy.phone) {
      await twilioService.sendOtpSms(helpRequest.elderly.registeredBy.phone, otp);
    }

    res.json({
      success: true,
      message: 'OTP పంపబడింది. పెద్దలు లేదా కుటుంబ సభ్యుడికి OTP నమోదు చేయమని చెప్పండి.',
      otp: otp, // Also return to show in app
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/volunteers/history
 * Get volunteer's past completed requests
 */
router.get('/history', protect, volunteerOnly, async (req, res) => {
  try {
    const requests = await HelpRequest.find({ volunteer: req.user.id })
      .populate('elderly', 'fullName address phone')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
