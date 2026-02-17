# Deployment Guide

## 1) Backend on Render
- Push repository to GitHub.
- Create new Render Web Service.
- Select repo and use `render.yaml` from project root.
- Set environment variables in Render:
  - `MONGO_URI` = your MongoDB Atlas connection string
  - `JWT_SECRET` = strong secret
  - `ADMIN_EMAIL` = default admin login email
  - `ADMIN_PASSWORD` = default admin login password
  - `ADMIN_NAME` = default admin display name
  - `RESET_TOKEN_TTL_MINUTES` = reset-token expiry window
- Deploy and copy backend URL (example: `https://elderly-care-backend.onrender.com`).

## 2) Frontend on Vercel
- Import the same GitHub repository in Vercel.
- Set Root Directory to `frontend`.
- Deploy.
- `frontend/vercel.json` is already configured for clean routes.

## 3) Connect Frontend to Backend
- Update production API URL in `frontend/script.js`:
  - `https://elderly-care-backend.onrender.com/api`
- Redeploy frontend after updating if needed.

## 4) Local Test Commands
- Backend start:
  - `cd backend`
  - `npm start`
- Run tests:
  - `cd backend`
  - `npm install`
  - `npm test`
