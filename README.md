# Care24 - Elderly Nursing & Healthcare Assistance Platform

## Overview
Care24 is a web-based platform that connects elderly people and families with verified caregivers (nurses, attendants, physiotherapists) for home-based care services.

## Key Features
- Role-based authentication (User, Caregiver, Admin)
- Caregiver registration and admin verification
- Patient profile creation and management
- Service browsing and booking (hourly/daily/long-term)
- Booking status tracking and care notes
- Payment flow with invoice generation
- Ratings and reviews
- Complaint/dispute handling
- Admin analytics and service management
- Mobile + desktop responsive UI

## Tech Stack
- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js, Express.js
- Database: MongoDB (Mongoose)
- Authentication: JWT

## Folder Structure
- `frontend/` - UI pages, styles, and scripts
- `backend/` - API server, models, scripts, tests
- `.github/workflows/` - CI workflow

## Setup Instructions
1. Open terminal in project backend folder:
   - `cd backend`
2. Install dependencies:
   - `npm install`
3. Create/update default admin:
   - `npm run create-admin`
4. Start backend server:
   - `npm start`
5. Open frontend:
   - Open `frontend/index.html` (or run using a local server)

## Default Admin Login
- Email: `admin@care24.com`
- Password: `Admin@123`

## Environment Variables
Use `backend/.env.example` as reference and create `backend/.env` with required values:
- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`
- `RESET_TOKEN_TTL_MINUTES`

## Deployment
- Frontend: Vercel (`frontend/vercel.json`)
- Backend: Render (`render.yaml`)
- Guide: `DEPLOYMENT.md`

## Submission Link
- GitHub Repository: https://github.com/Anushka241006/Elderly-care-platform
