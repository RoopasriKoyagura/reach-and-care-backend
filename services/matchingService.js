const Volunteer = require('../models/Volunteer');
const twilioService = require('./twilioService');

/**
 * Find nearest available volunteers within radius
 * Uses MongoDB 2dsphere index for geospatial query
 */
exports.findNearestVolunteers = async (coordinates, radiusKm = 10, limit = 5) => {
  const radiusInMeters = radiusKm * 1000;

  const volunteers = await Volunteer.find({
    isVerified: true,
    isActive: true,
    isAvailable: true,
    verificationStatus: 'approved',
    currentRequest: null, // Not already busy
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates, // [lng, lat]
        },
        $maxDistance: radiusInMeters,
      },
    },
  })
    .limit(limit)
    .select('fullName phone email fcmToken location address');

  return volunteers;
};

/**
 * Notify nearest volunteers about a new help request
 * Sends SMS and Socket.io notification
 */
exports.notifyNearestVolunteers = async (helpRequest, elderly, io) => {
  const coordinates = elderly.location.coordinates;
  const radiusKm = parseInt(process.env.VOLUNTEER_SEARCH_RADIUS_KM) || 10;

  let volunteers = await exports.findNearestVolunteers(coordinates, radiusKm);

  // If no volunteers found nearby, expand search
  if (volunteers.length === 0) {
    console.log('⚠️ No volunteers found in radius, expanding search...');
    volunteers = await exports.findNearestVolunteers(coordinates, radiusKm * 3);
  }

  if (volunteers.length === 0) {
    console.log('❌ No volunteers available anywhere nearby');
    return { notified: 0, volunteers: [] };
  }

  // Save notified volunteer IDs
  helpRequest.notifiedVolunteers = volunteers.map((v) => v._id);
  await helpRequest.save();

  // Send notifications to each volunteer
  const notificationPromises = volunteers.map(async (volunteer) => {
    // 1. SMS via Twilio
    await twilioService.sendVolunteerAlert(volunteer, helpRequest, elderly);

    // 2. Real-time Socket.io notification (if volunteer is logged in)
    if (io) {
      io.to(`volunteer_${volunteer._id}`).emit('new_request', {
        requestId: helpRequest._id,
        type: helpRequest.requestType,
        elderlyName: elderly.fullName,
        village: elderly.address.village || elderly.address.street,
        district: elderly.address.district,
        urgency: helpRequest.requestType === 'emergency' ? 'HIGH' : 'NORMAL',
        createdAt: helpRequest.createdAt,
      });
    }
  });

  await Promise.allSettled(notificationPromises);
  console.log(`✅ Notified ${volunteers.length} volunteers for request ${helpRequest._id}`);

  return { notified: volunteers.length, volunteers };
};
