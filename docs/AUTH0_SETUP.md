# Auth0 Setup Guide

## Step 1: Create Auth0 Account
1. Go to https://auth0.com
2. Sign up for a free account
3. Create a new tenant (or use default)

## Step 2: Create Application
1. Go to **Applications** → **Create Application**
2. Name: "B2C Segmentation"
3. Type: **Single Page Application (SPA)**
4. Click **Create**

## Step 3: Configure Application
1. Go to **Settings** tab
2. Set **Allowed Callback URLs**:
   ```
   http://localhost:3004/api/oauth/callback
   ```
3. Set **Allowed Logout URLs**:
   ```
   http://localhost:3004
   ```
4. Set **Allowed Web Origins**:
   ```
   http://localhost:3004
   ```
5. Scroll down and click **Save Changes**

## Step 4: Get Credentials
From the Settings page, copy:
- **Domain** (e.g., `dev-xxxxx.us.auth0.com`)
- **Client ID**

## Step 5: Update .env File
Open `.env` in the project root and update:

```env
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id-from-auth0
JWT_SECRET=generate-a-random-secret-here
DATABASE_URL=mysql://root:password@localhost:3306/b2c_segmentation
```

## Step 6: Enable Database Connection (Optional)
If you want username/password login:
1. Go to **Authentication** → **Database**
2. Click **Create Connection** → **Username-Password**
3. Enable it for your application

## Step 7: Enable Social Connections (Optional)
For Google, GitHub, etc.:
1. Go to **Authentication** → **Social**
2. Enable desired providers (Google, GitHub, etc.)
3. Follow provider-specific setup instructions

## Step 8: Test Login
1. Restart the dev servers:
   ```bash
   # Backend
   $env:NODE_ENV='development'; node_modules\.bin\tsx.cmd watch server/_core/index.ts
   
   # Frontend (in new terminal)
   pnpm vite
   ```
2. Open http://localhost:3004
3. Click "Sign in to continue"
4. You should be redirected to Auth0 login

## Troubleshooting

### "Invalid redirect_uri" error
- Make sure the callback URL in Auth0 settings exactly matches your app URL
- Include `/api/oauth/callback` path

### "Missing Auth0 domain" error  
- Ensure `VITE_AUTH0_DOMAIN` is set in `.env`
- Restart the frontend server after changing `.env`

### Database errors
- Make sure MySQL is running
- Create the database: `CREATE DATABASE b2c_segmentation;`
- Update `DATABASE_URL` in `.env` with correct credentials