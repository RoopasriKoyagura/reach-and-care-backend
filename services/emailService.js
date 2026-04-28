const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Reach & Care <noreply@reachandcare.org>',
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent to: ${to}`);
    return true;
  } catch (error) {
    console.error('❌ Email error:', error.message);
    return false;
  }
};

// Welcome email to family after elderly registration
exports.sendWelcomeEmail = async (family, elderly) => {
  await sendEmail({
    to: family.email,
    subject: 'Reach & Care - నమోదు విజయవంతమైంది | Registration Successful',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; border-radius: 10px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Reach & Care ❤️</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0;">Compassionate Elderly Support</p>
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #333;">నమస్కారం, ${family.name}!</h2>
          <p style="color: #555; line-height: 1.6;">
            <strong>${elderly.fullName}</strong> విజయవంతంగా నమోదు చేయబడ్డారు.
          </p>
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea;">
            <h3 style="color: #667eea; margin-top: 0;">హెల్ప్‌లైన్ నంబర్:</h3>
            <p style="font-size: 24px; font-weight: bold; color: #333; margin: 0;">${process.env.TWILIO_HELPLINE_NUMBER || 'XXXX-XXX-XXX'}</p>
            <p style="color: #777; font-size: 14px;">ఈ నంబర్‌ను మీ పెద్దలకు ఇవ్వండి. ఏదైనా అవసరమైనప్పుడు వారు కాల్ చేయవచ్చు.</p>
          </div>
          <div style="background: #fff3cd; border-radius: 8px; padding: 15px; margin: 15px 0;">
            <p style="margin: 0; color: #856404;"><strong>కాల్ చేసిన తర్వాత:</strong></p>
            <ul style="color: #856404;">
              <li>1 నొక్కండి → అత్యవసర సహాయం</li>
              <li>2 నొక్కండి → మందుల సహాయం</li>
              <li>3 నొక్కండి → నిత్యావసరాల సహాయం</li>
            </ul>
          </div>
          <p style="color: #555;">మీ పెద్దలు సురక్షితంగా ఉంటారు. మేము 24/7 అందుబాటులో ఉన్నాము.</p>
        </div>
        <div style="background: #f1f1f1; padding: 20px; text-align: center; color: #999; font-size: 12px;">
          © 2025 Reach & Care | Made with ❤️ for our elders
        </div>
      </div>
    `,
  });
};

// Volunteer welcome email
exports.sendVolunteerWelcomeEmail = async (volunteer) => {
  await sendEmail({
    to: volunteer.email,
    subject: 'Reach & Care - Volunteer Application Received',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #11998e, #38ef7d); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Reach & Care ❤️</h1>
        </div>
        <div style="padding: 30px; background: white;">
          <h2>నమస్కారం, ${volunteer.fullName}!</h2>
          <p>మీ వాలంటీర్ దరఖాస్తు అందుకున్నాం. మా బృందం మీ ID proof ధృవీకరించిన తర్వాత, మీరు యాక్టివేట్ చేయబడతారు.</p>
          <p>ధన్యవాదాలు మా సమాజానికి సేవ చేయడానికి ముందుకు వచ్చినందుకు!</p>
        </div>
      </div>
    `,
  });
};

// Completion notification to family
exports.sendCompletionEmail = async (family, elderly, volunteer, requestType) => {
  await sendEmail({
    to: family.email,
    subject: `Reach & Care - Help Request Completed for ${elderly.fullName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #28a745; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">✅ పని పూర్తయింది!</h1>
        </div>
        <div style="padding: 30px; background: white;">
          <p>${elderly.fullName} కి ${requestType} సహాయం విజయవంతంగా పూర్తయింది.</p>
          <p><strong>వాలంటీర్:</strong> ${volunteer.fullName} (${volunteer.phone})</p>
          <p>దయచేసి మీ feedback ఇవ్వండి: <a href="${process.env.FRONTEND_URL}/feedback">ఇక్కడ నొక్కండి</a></p>
        </div>
      </div>
    `,
  });
};
