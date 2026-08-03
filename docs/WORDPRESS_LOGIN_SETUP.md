# WordPress Login Integration - Setup Guide

## ✅ What's Complete

Your app now has **WordPress database integration** for user authentication. Here's what was set up:

### Files Created:
1. **`api/server-wordpress.js`** - Express server with WordPress REST API integration
2. **`api/wordpress-auth.js`** - WordPress authentication helper functions
3. **Updated `.env`** - WordPress configuration variables

### Features Implemented:
- ✅ Login with email/password (authenticates against WordPress)
- ✅ User registration (creates WordPress users)
- ✅ Google OAuth login (links to WordPress accounts)
- ✅ JWT token generation for app sessions
- ✅ Protected grading endpoint (requires authentication)

---

## 🚀 Setup Instructions

### Step 1: Install WordPress Authentication Plugin

You need the **JWT Authentication for WP REST API** plugin on your WordPress site:

1. Go to your WordPress admin dashboard at `https://redpen.empire16.com/wp-admin`
2. Navigate to **Plugins → Add New**
3. Search for **"JWT Authentication for WP REST API"** by Enrique Chavez
4. Click **Install** and then **Activate**

**Alternative:** If not available, you can use Basic Auth (less secure, but works as fallback)

### Step 2: Configure Environment Variables

Update your `.env` file with your WordPress credentials:

```env
# WordPress Configuration
WORDPRESS_SITE_URL=https://redpen.empire16.com
WORDPRESS_API_URL=https://redpen.empire16.com/wp-json
WORDPRESS_USERNAME=your_admin_username
WORDPRESS_PASSWORD=your_admin_password
```

**Replace:**
- `your_admin_username` - Your WordPress admin username
- `your_admin_password` - Your WordPress admin password (or application password)

### Step 3: Update vercel.json (if using Vercel)

Make sure your API routes point to the new WordPress server:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/server-wordpress.js" }
  ]
}
```

### Step 4: Update Entry Point

Change your API import from `api/server.js` to `api/server-wordpress.js` in:
- `vite.config.ts` (if configured)
- Package.json scripts
- Any build configuration

### Step 5: Test the Login Flow

1. **Start your dev server:**
   ```bash
   npm run dev
   ```

2. **Test Registration:**
   - Click "Sign up" in the AuthModal
   - Enter email, password, and name
   - Should create a new WordPress user

3. **Test Login:**
   - Use the email/password you just registered
   - Should authenticate and receive JWT token

4. **Test Google OAuth:**
   - Click "Sign in with Google"
   - Should link to WordPress account or create new one

---

## 📋 What Happens During Login

### Email/Password Login Flow:
```
User enters email & password
        ↓
Express backend receives request at /api/auth/login
        ↓
Validates credentials against WordPress via REST API
        ↓
WordPress confirms identity
        ↓
Express generates JWT token (30-day expiry)
        ↓
Token stored in localStorage on frontend
        ↓
User can now access grading endpoint
```

### Google OAuth Flow:
```
User clicks "Sign in with Google"
        ↓
Google verifies identity
        ↓
Express receives Google ID token
        ↓
Checks if WordPress user exists with that email
        ↓
If not: Creates new WordPress user
        ↓
If yes: Links Google account to existing user
        ↓
Generates JWT token
        ↓
User logged in
```

---

## ⚙️ API Endpoints

Your app now uses these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Login with email/password |
| `/api/auth/register` | POST | Create new user account |
| `/api/auth/google` | POST | Google OAuth login |
| `/api/auth/me` | GET | Get current user info |
| `/api/auth/logout` | POST | Logout |
| `/api/grade` | POST | Grade a paper (requires auth) |
| `/api/status` | GET | Check server status |

---

## 🔒 Security Notes

1. **Never commit credentials to GitHub**
   - Keep `.env` secrets private
   - Use environment variables on production

2. **WordPress Requirements:**
   - Install JWT Auth plugin OR
   - Enable Basic Auth (less secure)

3. **Token Expiry:**
   - Tokens expire after 30 days
   - Users must login again after expiry
   - Token is stored in localStorage

4. **Password Storage:**
   - Passwords are NOT stored in your app
   - WordPress handles password hashing
   - Only JWT tokens are used for app sessions

---

## 🐛 Troubleshooting

### "WordPress connection failed"
- Check `WORDPRESS_SITE_URL` and `WORDPRESS_API_URL` in `.env`
- Verify WordPress is accessible
- Test with: `curl https://redpen.empire16.com/wp-json/wp/v2/users/me`

### "Authentication plugin not found"
- JWT Auth plugin may not be installed
- The code falls back to Basic Auth automatically
- Fallback is less secure but still functional

### "Invalid credentials"
- Verify username/password in `.env`
- Check that WordPress user exists
- Try creating a new WordPress user first

### "CORS errors"
- CORS is enabled in the server
- Check browser console for specific error
- Verify frontend and backend URLs match

---

## 📦 Dependencies Used

- **axios** - For WordPress API requests
- **jsonwebtoken** - For JWT token generation
- **google-auth-library** - For Google OAuth
- **cors** - For cross-origin requests
- **express** - Server framework

All are already in your `package.json`.

---

## 🎯 Next Steps

1. ✅ Install WordPress JWT Auth plugin
2. ✅ Update `.env` with WordPress credentials
3. ✅ Test login/registration flow
4. ✅ Deploy to production
5. (Optional) Add user profile editing
6. (Optional) Add grading history to WordPress posts

Your WordPress database will now store all user accounts for the grading app! 🎉
