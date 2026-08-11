/**
 * WordPress Database Integration for Authentication
 * Manages user authentication against WordPress REST API
 */

import axios from 'axios';
import jwt from 'jsonwebtoken';

const WORDPRESS_URL = process.env.WORDPRESS_SITE_URL || 'https://redpen.empire16.com';
const WORDPRESS_API = process.env.WORDPRESS_API_URL || 'https://redpen.empire16.com/wp-json';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';

// WordPress JWT Auth endpoints (requires JWT Authentication for WP REST API plugin)
const WP_AUTH_ENDPOINTS = {
  validate: `${WORDPRESS_API}/jwt-auth/v1/token/validate`,
  validate_basic: `${WORDPRESS_API}/wp/v2/users/me`, // Fallback using basic auth
};

/**
 * Build admin Basic Auth header.
 * Required for /wp/v2/users lookups, since WordPress hides the `email`
 * field from unauthenticated/non-privileged requests.
 * WORDPRESS_PASSWORD must be a WordPress Application Password,
 * not the normal wp-admin login password.
 */
function getAdminAuthHeader() {
  const adminAuth = Buffer.from(
    `${process.env.WORDPRESS_USERNAME}:${process.env.WORDPRESS_PASSWORD}`
  ).toString('base64');
  return { Authorization: `Basic ${adminAuth}` };
}

/**
 * Get WordPress user by email (exact match)
 */
export async function getWordPressUserByEmail(email) {
  try {
    const response = await axios.get(`${WORDPRESS_API}/wp/v2/users`, {
      params: { search: email, context: 'edit' },
      headers: getAdminAuthHeader(),
      timeout: 5000,
    });
    return response.data.find((u) => u.email === email) || null;
  } catch (error) {
    console.error('Error fetching WordPress user by email:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Get WordPress user by username (exact match)
 */
export async function getWordPressUserByUsername(username) {
  try {
    const response = await axios.get(`${WORDPRESS_API}/wp/v2/users`, {
      params: { search: username, context: 'edit' },
      headers: getAdminAuthHeader(),
      timeout: 5000,
    });
    return (
      response.data.find(
        (u) => u.username === username || u.slug === username
      ) || null
    );
  } catch (error) {
    console.error('Error fetching WordPress user by username:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Authenticate user against WordPress
 * Uses JWT Auth token validation
 */
export async function authenticateWithWordPress(username, password) {
  try {
    // First attempt: Use JWT Auth plugin endpoint (most secure)
    try {
      const tokenResponse = await axios.post(
        `${WORDPRESS_API}/jwt-auth/v1/token`,
        { username, password },
        { timeout: 5000 }
      );

      const { token, user_email, user_nicename } = tokenResponse.data;

      return {
        success: true,
        wordPressToken: token,
        email: user_email,
        username: user_nicename,
        userId: null, // Will be fetched separately
      };
    } catch (jwtError) {
      // Fallback: Validate using Basic Auth with wp/v2/users/me
      console.log('JWT Auth plugin not available, trying Basic Auth fallback');

      const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
      const meResponse = await axios.get(`${WORDPRESS_API}/wp/v2/users/me`, {
        headers: { Authorization: `Basic ${basicAuth}` },
        timeout: 5000,
      });

      return {
        success: true,
        email: meResponse.data.email,
        username: meResponse.data.username,
        userId: meResponse.data.id,
        wordPressId: meResponse.data.id,
      };
    }
  } catch (error) {
    console.error('WordPress authentication failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Create WordPress user via REST API
 * Requires authentication with admin/editor user
 */
export async function createWordPressUser(userData) {
  try {
    const response = await axios.post(
      `${WORDPRESS_API}/wp/v2/users`,
      {
        username: userData.username || userData.email.split('@')[0],
        email: userData.email,
        password: userData.password,
        first_name: userData.name?.split(' ')[0] || '',
        last_name: userData.name?.split(' ').slice(1).join(' ') || '',
        name: userData.name || userData.email,
      },
      {
        headers: getAdminAuthHeader(),
        timeout: 5000,
      }
    );

    return {
      success: true,
      user: {
        id: response.data.id,
        email: response.data.email,
        username: response.data.username,
        name: response.data.name,
      },
    };
  } catch (error) {
    console.error('WordPress user creation failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Verify WordPress JWT token
 */
export async function verifyWordPressToken(token) {
  try {
    const response = await axios.get(WP_AUTH_ENDPOINTS.validate, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    });
    return response.data;
  } catch (error) {
    console.error('WordPress token validation failed:', error.message);
    return null;
  }
}

/**
 * Generate app JWT token for authenticated user
 */
export function generateAppToken(user) {
  return jwt.sign(
    {
      email: user.email,
      id: user.id || user.userId,
      username: user.username,
      wordPressId: user.wordPressId,
      source: 'wordpress',
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * Sync WordPress user to app database (optional)
 */
export async function syncWordPressUser(user) {
  return {
    id: user.id || user.userId,
    email: user.email,
    username: user.username,
    name: user.name,
    wordPressId: user.wordPressId || user.id,
    tier: 'free',
    gradingCount: 0,
    gradingLimit: 5,
  };
}

/**
 * Get a user meta value (JSON) by key
 */
export async function getUserMeta(userId, key) {
  try {
    const response = await axios.get(`${WORDPRESS_API}/wp/v2/users/${userId}`, {
      params: { context: 'edit' },
      headers: getAdminAuthHeader(),
      timeout: 5000,
    });
    const raw = response.data?.meta?.[key];
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } catch (error) {
    console.error(`Error fetching user meta "${key}":`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Update a user meta value (stored as JSON string)
 */
export async function updateUserMeta(userId, key, value) {
  try {
    await axios.post(
      `${WORDPRESS_API}/wp/v2/users/${userId}`,
      { meta: { [key]: JSON.stringify(value) } },
      { headers: getAdminAuthHeader(), timeout: 5000 }
    );
    return true;
  } catch (error) {
    console.error(`Error updating user meta "${key}":`, error.response?.data || error.message);
    return false;
  }
}

/**
 * Update a WordPress user's password (admin-privileged action)
 */
export async function updateWordPressUserPassword(userId, newPassword) {
  try {
    await axios.post(
      `${WORDPRESS_API}/wp/v2/users/${userId}`,
      { password: newPassword },
      { headers: getAdminAuthHeader(), timeout: 5000 }
    );
    return { success: true };
  } catch (error) {
    console.error('Password update failed:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

/**
 * Permanently delete a WordPress user (admin-privileged action)
 */
export async function deleteWordPressUser(userId) {
  try {
    await axios.delete(`${WORDPRESS_API}/wp/v2/users/${userId}`, {
      params: { force: true },
      headers: getAdminAuthHeader(),
      timeout: 5000,
    });
    return { success: true };
  } catch (error) {
    console.error('User deletion failed:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}
/**
 * Upload a profile picture to the WordPress media library and
 * link it to the user via redpen_profile meta.
 * imageBuffer: raw Buffer of the image file
 * filename: original filename (used for extension detection)
 * mimeType: e.g. 'image/jpeg'
 */
export async function uploadProfilePicture(userId, imageBuffer, filename, mimeType) {
  try {
    const uploadResponse = await axios.post(
      `${WORDPRESS_API}/wp/v2/media`,
      imageBuffer,
      {
        headers: {
          ...getAdminAuthHeader(),
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
        maxBodyLength: 10 * 1024 * 1024, // 10MB safety cap
        timeout: 15000,
      }
    );

    const mediaUrl = uploadResponse.data?.source_url;
    if (!mediaUrl) {
      return { success: false, error: 'Upload succeeded but no URL was returned' };
    }

    return { success: true, url: mediaUrl, mediaId: uploadResponse.data.id };
  } catch (error) {
    console.error('Profile picture upload failed:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}
export default {
  authenticateWithWordPress,
  createWordPressUser,
  verifyWordPressToken,
  generateAppToken,
  getWordPressUserByEmail,
  getWordPressUserByUsername,
  syncWordPressUser,
  getUserMeta,
  updateUserMeta,
  updateWordPressUserPassword,
  deleteWordPressUser,
  uploadProfilePicture,
};
