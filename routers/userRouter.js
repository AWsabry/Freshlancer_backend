const express = require('express');

const router = express.Router();
const authController = require('../controllers/auth/authController');
const withdrawalController = require('../controllers/withdrawalController');
const { uploadResume, uploadAdditionalDocument, uploadPhoto } = require('../middleware/upload');
const { uploadWithErrorHandling } = require('../middleware/uploadErrorHandler');

/**
 * @openapi
 * /api/v1/users/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     description: |
 *       Request body must include `name`, `email`, `password`, `passwordConfirm`, and `role` (`student` or `client` for public signup). Additional required fields depend on the role (e.g. students need phone, nationality, gender, and country or related student profile data).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, passwordConfirm, role]
 *             properties:
 *               name: { type: string, minLength: 5, maxLength: 40 }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 12, description: Must meet strength rules enforced by the API }
 *               passwordConfirm: { type: string }
 *               role: { type: string, enum: [student, client, admin, moderator] }
 *     responses:
 *       201:
 *         description: User created; verify email as required
 *       400:
 *         description: Validation or duplicate email error
 */
router.post('/signup', authController.signup);
/**
 * @openapi
 * /api/v1/users/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     description: Returns a JWT and sets a `jwt` httpOnly cookie. User must be email-verified. Use **Authorize** in Swagger with the token for protected routes.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Login successful; body includes `token` and `data.user` (see API response in browser or client)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Missing or invalid input
 *       401:
 *         description: Invalid credentials, unverified email, or inactive account
 */
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.post('/forgotPassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);
router.get('/verifyEmail/:token', authController.verifyEmail);
// Resend verification email - can be called by authenticated or unauthenticated users
// This route should be accessible even if email is not verified
router.post('/resendVerificationEmail', authController.resendVerificationEmail);

// Protect all routes below (require authentication)
router.use(authController.protect);

// Require email verification for all protected routes
// This allows resendVerificationEmail to work, but blocks everything else
router.use(authController.requireEmailVerification);

/**
 * @openapi
 * /api/v1/users/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Not logged in or invalid token
 */
router.get('/me', authController.getMe);
router.patch('/updateMe', authController.updateMe);
router.patch('/updateMyPassword', authController.updatePassword);
router.get('/platform-stats', authController.getPlatformStats);
router.get('/client-dashboard-stats', authController.getClientDashboardStats);

// Photo upload route
router.post('/uploadPhoto', uploadWithErrorHandling(uploadPhoto.single('photo')), authController.uploadPhoto);

// Resume upload/delete routes
router.post('/uploadResume', uploadWithErrorHandling(uploadResume.single('resume')), authController.uploadResume);
router.delete('/deleteResume', authController.deleteResume);

// Additional documents upload/delete routes
router.post('/uploadAdditionalDocument', uploadWithErrorHandling(uploadAdditionalDocument.single('document')), authController.uploadAdditionalDocument);
router.delete('/deleteAdditionalDocument', authController.deleteAdditionalDocument);

// Withdrawal routes (student only)
router.get('/withdrawal-minimums', withdrawalController.getWithdrawalMinimums);
router.get('/withdrawals', withdrawalController.getMyWithdrawals);
router.post('/withdrawal-request', withdrawalController.requestWithdrawal);

module.exports = router;
