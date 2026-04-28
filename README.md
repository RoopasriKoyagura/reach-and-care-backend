# Reach & Care — Complete Backend

A production-ready Node.js backend for the Reach & Care elderly support platform.

---

## 🏗️ Architecture Overview

```
Elderly calls helpline
        ↓
Twilio IVR (Telugu prompts: 1=Emergency, 2=Medicine, 3=Daily needs)
        ↓
Backend receives digit input via webhook
        ↓
Creates HelpRequest in MongoDB
        ↓
Finds nearest volunteers (geo-search)
        ↓
Sends SMS alerts to volunteers (Twilio)
        ↓  (+ Socket.io real-time if app is open)
Volunteer accepts → Gets elderly details via SMS
        ↓
Volunteer arrives, completes task
        ↓
Generates OTP → Sends to family/volunteer
        ↓
OTP verified → Status = "completed"
        ↓
Family gives feedback/rating
```

---

## ⚙️ Setup Instructions

### 1. Install dependencies
```bash
cd reach-and-care-backend
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
# Edit .env and fill in all values
```

### 3. Set up MongoDB Atlas (Free)
1. Go to https://mongodb.com/atlas
2. Create free cluster
3. Click "Connect" → Get connection string
4. Paste in `MONGODB_URI` in your `.env`

### 4. Set up Twilio (IVR + SMS)
1. Go to https://twilio.com → Create free account
2. Get a phone number (this is your helpline number)
3. Go to Console → Copy `Account SID` and `Auth Token`
4. Paste into `.env`
5. **Configure IVR webhook:**
   - In Twilio Console → Phone Numbers → Your number
   - Under "A call comes in" → Set to: `https://YOUR_DOMAIN/api/ivr/welcome`
   - Method: HTTP POST

### 5. Set up Gmail for emails
1. Enable 2FA on your Gmail
2. Go to Google Account → Security → App Passwords
3. Generate app password for "Mail"
4. Use that password (not your Gmail password) in `EMAIL_PASS`

### 6. Create first admin
```bash
# Start the server, then run:
curl -X POST http://localhost:5000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin",
    "email": "admin@reachandcare.org",
    "password": "SecurePass123!",
    "setupKey": "YOUR_JWT_SECRET_FROM_ENV"
  }'
```

### 7. Start the server
```bash
# Development
npm run dev

# Production
npm start
```

---

## 📡 API Reference

### IVR (Twilio Webhooks)
| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/ivr/welcome` | Entry point when elderly calls |
| POST | `/api/ivr/handle-input` | Handles 1/2/3 digit press |

### Elderly
| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| POST | `/api/elderly/register` | Public | Register elderly person |
| GET | `/api/elderly/:id` | JWT | Get elderly details |
| GET | `/api/elderly` | Admin | List all elderly |
| PUT | `/api/elderly/:id` | JWT | Update elderly profile |

### Volunteers
| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| POST | `/api/volunteers/register` | Public | Apply as volunteer |
| POST | `/api/volunteers/login` | Public | Volunteer login |
| GET | `/api/volunteers/profile` | JWT | Own profile |
| PUT | `/api/volunteers/availability` | JWT | Toggle online/offline |
| POST | `/api/volunteers/accept/:id` | JWT | Accept help request |
| POST | `/api/volunteers/decline/:id` | JWT | Decline help request |
| POST | `/api/volunteers/arrived/:id` | JWT | Mark arrived at location |
| POST | `/api/volunteers/generate-otp/:id` | JWT | Generate completion OTP |
| GET | `/api/volunteers/history` | JWT | Past requests |

### Requests
| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| GET | `/api/requests` | Admin | All requests |
| GET | `/api/requests/:id` | JWT | Single request |
| POST | `/api/requests/:id/verify-otp` | Public | Verify OTP → complete |
| POST | `/api/requests/:id/feedback` | Public | Submit rating |
| POST | `/api/requests/:id/cancel` | Admin | Cancel request |
| GET | `/api/requests/stats/dashboard` | Admin | Dashboard stats |

### Admin
| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| POST | `/api/admin/login` | Public | Admin login |
| POST | `/api/admin/setup` | Setup Key | Create first admin |
| GET | `/api/admin/volunteers/pending` | Admin | Pending approvals |
| PUT | `/api/admin/volunteers/:id/approve` | Admin | Approve volunteer |
| PUT | `/api/admin/volunteers/:id/reject` | Admin | Reject volunteer |
| GET | `/api/admin/volunteers` | Admin | All volunteers |

---

## 🔌 Socket.io Events

### Client → Server
```javascript
socket.emit('join_volunteer', volunteerId);  // Volunteer logs in
socket.emit('join_admin');                   // Admin logs in
```

### Server → Client
```javascript
// New help request (to volunteer)
socket.on('new_request', { requestId, type, elderlyName, village, district, urgency });

// Request taken by someone else
socket.on('request_taken', { requestId });

// Request completed
socket.on('request_completed', { requestId, message });
```

---

## 🚀 Deployment (Render / Railway)

### Deploy to Render (Free)
1. Push code to GitHub
2. Go to https://render.com → New Web Service
3. Connect your GitHub repo
4. Set environment variables in Render dashboard
5. Deploy!

### Deploy to Railway
1. `npm install -g @railway/cli`
2. `railway login`
3. `railway init`
4. `railway up`

---

## 🔧 Connecting to Frontend

In your frontend, set:
```javascript
const API_URL = 'https://your-backend-url.onrender.com';

// Example: Register elderly
const response = await fetch(`${API_URL}/api/elderly/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(formData)
});

// Example: Volunteer login
const loginRes = await fetch(`${API_URL}/api/volunteers/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const { token } = await loginRes.json();

// Example: Protected route
const profile = await fetch(`${API_URL}/api/volunteers/profile`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## 🌐 Telugu IVR Audio (Production Recommendation)

For better Telugu pronunciation, pre-record audio files:
1. Record Telugu prompts using a native speaker
2. Host them on your server or Cloudinary
3. Replace `<Say>` with `<Play url="https://yourserver.com/audio/greeting.mp3" />`

---

## 📁 Project Structure
```
reach-and-care-backend/
├── server.js              # Entry point (Express + Socket.io)
├── config/
│   └── db.js              # MongoDB connection
├── models/
│   ├── Elderly.js         # Elderly person schema
│   ├── Volunteer.js       # Volunteer schema
│   ├── HelpRequest.js     # Request schema (core)
│   └── Admin.js           # Admin schema
├── routes/
│   ├── ivr.js             # Twilio IVR webhooks
│   ├── elderly.js         # Elderly CRUD
│   ├── volunteers.js      # Volunteer actions
│   ├── requests.js        # Request management
│   └── admin.js           # Admin panel
├── services/
│   ├── twilioService.js   # IVR + SMS
│   ├── matchingService.js # Geo-based volunteer finder
│   └── emailService.js    # Email notifications
├── middleware/
│   └── auth.js            # JWT middleware
├── .env.example           # Environment template
└── package.json
```
