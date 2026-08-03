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
      ) || response.data[0] || null
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

export default {
  authenticateWithWordPress,
  createWordPressUser,
  verifyWordPressToken,
  generateAppToken,
  getWordPressUserByEmail,
  getWordPressUserByUsername,
  syncWordPressUser,
};
