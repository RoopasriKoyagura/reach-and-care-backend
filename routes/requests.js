const express = require('express');
const router = express.Router();
const HelpRequest = require('../models/HelpRequest');
const Volunteer = require('../models/Volunteer');
const Elderly = require('../models/Elderly');
const emailService = require('../services/emailService');
const { protect, adminOnly } = require('../middleware/auth');

/**
 * GET /api/requests
 * Get all requests (admin only)
 */
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};

    const total = await HelpRequest.countDocuments(filter);
    const requests = await HelpRequest.find(filter)
      .populate('elderly', 'fullName phone address')
      .populate('volunteer', 'fullName phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, total, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/requests/:id
 * Get a specific request
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const request = await HelpRequest.findById(req.params.id)
      .populate('elderly')
      .populate('volunteer', 'fullName phone rating');

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    res.json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/requests/:id/verify-otp
 * Verify OTP to mark request as complete
 * Called by volunteer/family/elderly after task done
 */
router.post('/:id/verify-otp', async (req, res) => {
  try {
    const { otp } = req.body;

    const helpRequest = await HelpRequest.findById(req.params.id)
      .populate('elderly')
      .populate('volunteer');

    if (!helpRequest) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (helpRequest.status === 'completed') {
      return res.status(400).json({ success: false, message: 'ఈ request ఇప్పటికే complete అయింది.' });
    }

    // Check OTP
    if (helpRequest.completionOtp !== otp) {
      return res.status(400).json({ success: false, message: 'తప్పు OTP. దయచేసి మళ్ళీ నమోదు చేయండి.' });
    }

    // Check OTP expiry
    const otpExpiry = (parseInt(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000;
    if (Date.now() - new Date(helpRequest.otpGeneratedAt).getTime() > otpExpiry) {
      return res.status(400).json({
        success: false,
        message: 'OTP కాలం తీరిపోయింది. కొత్త OTP generate చేయండి.',
      });
    }

    // Mark complete
    helpRequest.status = 'completed';
    helpRequest.otpVerified = true;
    helpRequest.completedAt = new Date();
    await helpRequest.save();

    // Free up volunteer
    if (helpRequest.volunteer) {
      const volunteer = await Volunteer.findById(helpRequest.volunteer._id);
      volunteer.currentRequest = null;
      volunteer.isAvailable = true;
      volunteer.totalHelpsDone += 1;
      await volunteer.save();
    }

    // Notify family via email
    if (helpRequest.elderly.registeredBy.email) {
      await emailService.sendCompletionEmail(
        helpRequest.elderly.registeredBy,
        helpRequest.elderly,
        helpRequest.volunteer,
        helpRequest.requestType
      );
    }

    // Notify via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`volunteer_${helpRequest.volunteer._id}`).emit('request_completed', {
        requestId: helpRequest._id,
        message: 'పని పూర్తయింది! ధన్యవాదాలు.',
      });
    }

    res.json({
      success: true,
      message: 'పని విజయవంతంగా పూర్తయింది! వాలంటీర్‌కు ధన్యవాదాలు.',
      data: { requestId: helpRequest._id, completedAt: helpRequest.completedAt },
    });
  } catch (error) {
    console.error('OTP verify error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/requests/:id/feedback
 * Submit feedback/rating after completion
 * Public (family can give feedback without login)
 */
router.post('/:id/feedback', async (req, res) => {
  try {
    const { rating, comment, givenBy } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating 1-5 మధ్య ఉండాలి.' });
    }

    const helpRequest = await HelpRequest.findById(req.params.id);
    if (!helpRequest) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (helpRequest.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Request complete కాలేదు.' });
    }

    // Save feedback
    helpRequest.feedback = { rating, comment, givenBy, givenAt: new Date() };
    helpRequest.status = 'rated';
    await helpRequest.save();

    // Update volunteer's average rating
    if (helpRequest.volunteer) {
      const volunteer = await Volunteer.findById(helpRequest.volunteer);
      const totalRating = volunteer.rating * volunteer.ratingCount + rating;
      volunteer.ratingCount += 1;
      volunteer.rating = totalRating / volunteer.ratingCount;
      await volunteer.save();
    }

    res.json({ success: true, message: 'మీ feedback కోసం ధన్యవాదాలు!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/requests/:id/cancel
 * Cancel a pending request (admin only)
 */
router.post('/:id/cancel', protect, adminOnly, async (req, res) => {
  try {
    const helpRequest = await HelpRequest.findById(req.params.id);
    if (!helpRequest) return res.status(404).json({ success: false, message: 'Not found' });

    helpRequest.status = 'cancelled';
    await helpRequest.save();

    res.json({ success: true, message: 'Request cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/requests/stats/dashboard
 * Dashboard stats
 */
router.get('/stats/dashboard', protect, adminOnly, async (req, res) => {
  try {
    const [
      totalElderly,
      totalVolunteers,
      totalRequests,
      completedRequests,
      pendingRequests,
      emergencyRequests,
    ] = await Promise.all([
      require('../models/Elderly').countDocuments(),
      require('../models/Volunteer').countDocuments({ verificationStatus: 'approved' }),
      HelpRequest.countDocuments(),
      HelpRequest.countDocuments({ status: { $in: ['completed', 'rated'] } }),
      HelpRequest.countDocuments({ status: 'pending' }),
      HelpRequest.countDocuments({ requestType: 'emergency' }),
    ]);

    const satisfactionRate =
      totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 100) : 0;

    res.json({
      success: true,
      data: {
        totalElderly,
        totalVolunteers,
        totalRequests,
        completedRequests,
        pendingRequests,
        emergencyRequests,
        satisfactionRate,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
