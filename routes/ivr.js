const express = require('express');
const router = express.Router();
const Elderly = require('../models/Elderly');
const HelpRequest = require('../models/HelpRequest');
const twilioService = require('../services/twilioService');
const matchingService = require('../services/matchingService');
const emailService = require('../services/emailService');

// All Twilio webhooks need raw body (not JSON)
// Twilio sends application/x-www-form-urlencoded

/**
 * GET/POST /api/ivr/welcome
 * Entry point when someone calls the helpline number
 * Twilio calls this URL when a call comes in
 */
router.all('/welcome', (req, res) => {
  res.type('text/xml');
  res.send(twilioService.generateGreetingTwiml());
});

/**
 * POST /api/ivr/handle-input
 * Twilio calls this after the user presses a digit
 * Body contains: Digits, CallSid, From, To, etc.
 */
router.post('/handle-input', async (req, res) => {
  const { Digits, CallSid, From } = req.body;
  res.type('text/xml');

  // Normalize caller number (Twilio sends E.164: +91XXXXXXXXXX)
  const callerPhone = From;

  // Valid inputs: 1, 2, 3
  if (!['1', '2', '3'].includes(Digits)) {
    return res.send(twilioService.generateInvalidInputTwiml());
  }

  const requestTypeMap = {
    '1': 'emergency',
    '2': 'medicine',
    '3': 'daily_needs',
  };

  try {
    // Find elderly by phone number
    const elderly = await Elderly.findOne({
      $or: [
        { phone: callerPhone },
        { phone: callerPhone.replace('+91', '0') }, // Handle 0XX format
        { phone: callerPhone.slice(-10) }, // Last 10 digits
      ],
      isActive: true,
    });

    if (!elderly) {
      // Unregistered caller - still respond but log it
      console.log(`⚠️ Unregistered caller: ${callerPhone}`);
      const twiml = require('twilio').twiml.VoiceResponse;
      const response = new twiml();
      response.say(
        { voice: 'Polly.Aditi', language: 'hi-IN' },
        'మీ నంబర్ నమోదు కాలేదు. దయచేసి మీ పిల్లలకు చెప్పి ముందుగా నమోదు చేయించుకోండి.'
      );
      response.hangup();
      return res.send(response.toString());
    }

    // Create help request in DB
    const helpRequest = new HelpRequest({
      elderly: elderly._id,
      requestType: requestTypeMap[Digits],
      ivrCallSid: CallSid,
      callerPhone: callerPhone,
      ivrInput: Digits,
      status: 'pending',
      location: elderly.location,
    });
    await helpRequest.save();

    // Update elderly stats
    elderly.totalRequests += 1;
    await elderly.save();

    // Send IVR confirmation to caller immediately
    res.send(twilioService.generateConfirmationTwiml(Digits, elderly.fullName));

    // Notify family asynchronously (don't block IVR response)
    setImmediate(async () => {
      try {
        // Notify nearest volunteers
        const io = req.app.get('io');
        await matchingService.notifyNearestVolunteers(helpRequest, elderly, io);

        // Notify family
        if (elderly.registeredBy.phone) {
          await twilioService.notifyFamily(
            elderly.registeredBy.phone,
            elderly,
            requestTypeMap[Digits]
          );
        }
        if (elderly.registeredBy.email) {
          // Email notification async
        }

        // Auto-escalate emergency after 5 minutes if no volunteer accepts
        if (requestTypeMap[Digits] === 'emergency') {
          setTimeout(async () => {
            const freshRequest = await HelpRequest.findById(helpRequest._id);
            if (freshRequest && freshRequest.status === 'pending') {
              console.log(`🚨 ESCALATING emergency request: ${helpRequest._id}`);
              freshRequest.escalated = true;
              freshRequest.escalationCount += 1;
              await freshRequest.save();
              // Notify admin / expand search
              await matchingService.notifyNearestVolunteers(
                freshRequest,
                elderly,
                io,
                true // expanded radius
              );
            }
          }, 5 * 60 * 1000); // 5 minutes
        }
      } catch (err) {
        console.error('Background notification error:', err.message);
      }
    });
  } catch (error) {
    console.error('IVR handle-input error:', error);
    const { twiml: { VoiceResponse } } = require('twilio');
    const response = new VoiceResponse();
    response.say(
      { voice: 'Polly.Aditi', language: 'hi-IN' },
      'క్షమించండి, సాంకేతిక సమస్య వచ్చింది. దయచేసి మళ్ళీ ప్రయత్నించండి.'
    );
    res.send(response.toString());
  }
});

module.exports = router;
