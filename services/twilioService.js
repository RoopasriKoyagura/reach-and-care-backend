const twilio = require('twilio');

// Initialize Twilio client (optional - only if credentials provided)
let client = null;
console.log('Twilio SID exists:', !!process.env.TWILIO_ACCOUNT_SID);
console.log('Twilio Token exists:', !!process.env.TWILIO_AUTH_TOKEN);
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  console.log('✅ Twilio initialized successfully');
} else {
  console.log('⚠️ Twilio not configured - SMS/Call features disabled');
}

const VoiceResponse = twilio.twiml.VoiceResponse;

// ================================================
// IVR TWIML - Telugu voice prompts
// ================================================

exports.generateGreetingTwiml = () => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: '/api/ivr/handle-input',
    method: 'POST',
    timeout: 10,
  });

  gather.say(
    { voice: 'Polly.Aditi', language: 'hi-IN' },
    `నమస్కారం! రీచ్ అండ్ కేర్ హెల్ప్‌లైన్‌కి స్వాగతం. 
     అత్యవసర సహాయం కోసం వన్ నొక్కండి. 
     మందుల సహాయం కోసం టూ నొక్కండి. 
     నిత్యావసరాల సహాయం కోసం త్రీ నొక్కండి.`
  );

  twiml.say(
    { voice: 'Polly.Aditi', language: 'hi-IN' },
    'మీరు ఏ నంబర్ నొక్కలేదు. దయచేసి మళ్ళీ ప్రయత్నించండి.'
  );
  twiml.redirect('/api/ivr/welcome');

  return twiml.toString();
};

exports.generateConfirmationTwiml = (digit, elderlyName) => {
  const twiml = new VoiceResponse();

  const messages = {
    '1': `అత్యవసర సేవ కోసం మీ అభ్యర్థన నమోదు చేయబడింది. సమీప వాలంటీర్ మీ దగ్గరకు వస్తారు. దయచేసి వేచి ఉండండి.`,
    '2': `మందుల సహాయం కోసం మీ అభ్యర్థన నమోదు చేయబడింది. సమీప వాలంటీర్ మీ దగ్గరకు వస్తారు. దయచేసి వేచి ఉండండి.`,
    '3': `నిత్యావసరాల సహాయం కోసం మీ అభ్యర్థన నమోదు చేయబడింది. సమీప వాలంటీర్ మీ దగ్గరకు వస్తారు. దయచేసి వేచి ఉండండి.`,
  };

  const message = messages[digit] || `మీ అభ్యర్థన అందుకున్నాం. వాలంటీర్ వస్తారు.`;
  twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, message);
  twiml.hangup();

  return twiml.toString();
};

exports.generateInvalidInputTwiml = () => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: '/api/ivr/handle-input',
    method: 'POST',
    timeout: 10,
  });
  gather.say(
    { voice: 'Polly.Aditi', language: 'hi-IN' },
    `తప్పు నంబర్ నొక్కారు. దయచేసి మళ్ళీ ప్రయత్నించండి. 
     అత్యవసర సహాయం కోసం వన్, మందుల సహాయం కోసం టూ, నిత్యావసరాల కోసం త్రీ నొక్కండి.`
  );
  return twiml.toString();
};

// ================================================
// SMS NOTIFICATIONS
// ================================================

exports.sendVolunteerAlert = async (volunteer, helpRequest, elderly) => {
  if (!client) {
    console.log('⚠️ Twilio not configured, skipping volunteer SMS');
    return false;
  }

  const requestTypeMap = {
    emergency: '🚨 అత్యవసర సహాయం',
    medicine: '🏥 మందుల సహాయం',
    daily_needs: '🛒 నిత్యావసరాల సహాయం',
  };

  const message =
    `Reach & Care - నూతన సహాయ అభ్యర్థన!\n` +
    `రకం: ${requestTypeMap[helpRequest.requestType]}\n` +
    `పెద్దల పేరు: ${elderly.fullName}\n` +
    `ఫోన్: ${elderly.phone}\n` +
    `గ్రామం: ${elderly.address.village || elderly.address.street}, ${elderly.address.district}\n\n` +
    `అంగీకరించడానికి: ${process.env.FRONTEND_URL}/volunteer/accept/${helpRequest._id}`;

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: volunteer.phone,
    });
    console.log(`✅ SMS sent to volunteer: ${volunteer.phone}`);
    return true;
  } catch (error) {
    console.error(`❌ SMS failed to ${volunteer.phone}:`, error.message);
    return false;
  }
};

exports.sendElderlyDetailsToVolunteer = async (volunteer, elderly, helpRequest) => {
  if (!client) {
    console.log('⚠️ Twilio not configured, skipping elderly details SMS');
    return false;
  }

  const healthInfo =
    elderly.healthIssues && elderly.healthIssues.length > 0
      ? elderly.healthIssues.join(', ')
      : 'లేదు';

  const message =
    `✅ మీరు సహాయ అభ్యర్థన అంగీకరించారు!\n\n` +
    `👤 పెద్దల వివరాలు:\n` +
    `పేరు: ${elderly.fullName}\n` +
    `వయసు: ${elderly.age}\n` +
    `ఫోన్: ${elderly.phone}\n` +
    `చిరునామా: ${elderly.address.street}, ${elderly.address.village || ''}, ${elderly.address.mandal || ''}, ${elderly.address.district}\n` +
    `పిన్‌కోడ్: ${elderly.address.pincode}\n` +
    `ఆరోగ్య సమస్యలు: ${healthInfo}\n` +
    `రక్త గ్రూప్: ${elderly.bloodGroup || 'తెలియదు'}\n\n` +
    `👨‍👩‍👧 కుటుంబ సంప్రదింపు:\n` +
    `పేరు: ${elderly.registeredBy.name}\n` +
    `ఫోన్: ${elderly.registeredBy.phone}`;

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: volunteer.phone,
    });
    return true;
  } catch (error) {
    console.error('SMS send error:', error.message);
    return false;
  }
};

exports.sendOtpSms = async (phone, otp) => {
  if (!client) {
    console.log(`⚠️ Twilio not configured, OTP is: ${otp}`);
    return false;
  }

  const message =
    `Reach & Care OTP: ${otp}\n` +
    `పని పూర్తయిన తర్వాత ఈ OTP నమోదు చేయండి.\n` +
    `OTP ${process.env.OTP_EXPIRY_MINUTES || 10} నిమిషాల్లో కాలం తీరిపోతుంది.`;

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
    return true;
  } catch (error) {
    console.error('OTP SMS error:', error.message);
    return false;
  }
};

exports.notifyFamily = async (familyPhone, elderly, requestType) => {
  if (!client) {
    console.log('⚠️ Twilio not configured, skipping family SMS');
    return false;
  }

  const typeMap = {
    emergency: 'అత్యవసర సహాయం',
    medicine: 'మందుల సహాయం',
    daily_needs: 'నిత్యావసరాల సహాయం',
  };

  const message =
    `Reach & Care: ${elderly.fullName} ${typeMap[requestType]} కోసం హెల్ప్‌లైన్ కి కాల్ చేశారు.\n` +
    `మీ పెద్దలకు సమీప వాలంటీర్ పంపుతున్నాం.`;

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: familyPhone,
    });
    return true;
  } catch (error) {
    console.error('Family SMS error:', error.message);
    return false;
  }
};

module.exports.client = client;