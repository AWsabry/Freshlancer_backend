/* eslint-disable max-len, spaced-comment, no-trailing-spaces
 * JSDoc @openapi path definitions. Keep in sync with routers when routes change.
 */
/**
 * @openapi
 * /api/v1/users/logout:
 *   get:
 *     tags: [Auth]
 *     summary: Log out (clears jwt cookie; optional auth for logging)
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200: { description: Logged out }
 * /api/v1/users/forgotPassword:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset email
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ email ]
 *             properties: { email: { type: string, format: email } }
 *     responses:
 *       200: { description: If email exists, reset link sent }
 * /api/v1/users/resetPassword/{token}:
 *   patch:
 *     tags: [Auth]
 *     summary: Set new password with reset token from email
 *     parameters: [ { in: path, name: token, required: true, schema: { type: string } } ]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ password, passwordConfirm ]
 *             properties:
 *               password: { type: string }
 *               passwordConfirm: { type: string }
 *     responses:
 *       200: { description: Password updated }
 * /api/v1/users/verifyEmail/{token}:
 *   get:
 *     tags: [Auth]
 *     summary: Verify email address via token
 *     parameters: [ { in: path, name: token, required: true, schema: { type: string } } ]
 *     responses:
 *       200: { description: Email verified }
 * /api/v1/users/resendVerificationEmail:
 *   post:
 *     tags: [Auth]
 *     summary: Resend verification email (public or with optional auth for logged-in user)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties: { email: { type: string, format: email } }
 *     responses:
 *       200: { description: Email sent if applicable }
 * /api/v1/users/updateMe:
 *   patch:
 *     tags: [Auth]
 *     summary: Update current user profile
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       content:
 *         application/json: { schema: { type: object, additionalProperties: true } }
 *     responses: { 200: { description: Updated } }
 * /api/v1/users/updateMyPassword:
 *   patch:
 *     tags: [Auth]
 *     summary: Update password (logged in)
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ passwordCurrent, password, passwordConfirm ]
 *             properties:
 *               passwordCurrent: { type: string }
 *               password: { type: string }
 *               passwordConfirm: { type: string }
 *     responses: { 200: { description: Updated } }
 * /api/v1/users/platform-stats:
 *   get:
 *     tags: [Auth]
 *     summary: Platform stats (for authorized roles)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Stats } }
 * /api/v1/users/client-dashboard-stats:
 *   get:
 *     tags: [Auth]
 *     summary: Client dashboard stats
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Stats } }
 * /api/v1/users/uploadPhoto:
 *   post:
 *     tags: [Auth]
 *     summary: Upload profile photo (multipart field `photo`)
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema: { type: object, properties: { photo: { type: string, format: binary } } }
 *     responses: { 200: { description: Uploaded } }
 * /api/v1/users/uploadResume:
 *   post:
 *     tags: [Auth]
 *     summary: Upload resume (field `resume`)
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema: { type: object, properties: { resume: { type: string, format: binary } } }
 *     responses: { 200: { description: Uploaded } }
 * /api/v1/users/deleteResume:
 *   delete:
 *     tags: [Auth]
 *     summary: Delete resume
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Deleted } }
 * /api/v1/users/uploadAdditionalDocument:
 *   post:
 *     tags: [Auth]
 *     summary: Upload additional document
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema: { type: object, properties: { document: { type: string, format: binary } } }
 *     responses: { 200: { description: Uploaded } }
 * /api/v1/users/deleteAdditionalDocument:
 *   delete:
 *     tags: [Auth]
 *     summary: Delete additional document
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Deleted } }
 * /api/v1/users/withdrawal-minimums:
 *   get:
 *     tags: [Users]
 *     summary: Minimum withdrawal rules (student)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Minimums } }
 * /api/v1/users/withdrawals:
 *   get:
 *     tags: [Users]
 *     summary: List my withdrawals
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/users/withdrawal-request:
 *   post:
 *     tags: [Users]
 *     summary: Request a withdrawal
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       content:
 *         application/json: { schema: { type: object, additionalProperties: true } }
 *     responses: { 201: { description: Created } }
 */
/**
 * @openapi
 * /api/v1/jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: List job posts
 *     security: [ { bearerAuth: [] } ]
 *   post:
 *     tags: [Jobs]
 *     summary: Create job post
 *     security: [ { bearerAuth: [] } ]
 *     requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses: { 201: { description: Created } }
 * /api/v1/jobs/featured:
 *   get:
 *     tags: [Jobs]
 *     summary: Featured job posts
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/jobs/search:
 *   get:
 *     tags: [Jobs]
 *     summary: Search job posts
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/jobs/stats:
 *   get:
 *     tags: [Jobs]
 *     summary: Job post statistics
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Stats } }
 * /api/v1/jobs/{id}:
 *   get:
 *     tags: [Jobs]
 *     summary: Get one job
 *     security: [ { bearerAuth: [] } ]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *   patch:
 *     tags: [Jobs]
 *     summary: Update job (client)
 *     security: [ { bearerAuth: [] } ]
 *   delete:
 *     tags: [Jobs]
 *     summary: Delete job (client)
 *     security: [ { bearerAuth: [] } ]
 * /api/v1/jobs/{id}/close:
 *   patch:
 *     tags: [Jobs]
 *     summary: Close job post
 *     security: [ { bearerAuth: [] } ]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: Closed } }
 */
/**
 * @openapi
 * /api/v1/applications:
 *   get:
 *     tags: [Applications]
 *     summary: List my job applications
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/applications/stats:
 *   get:
 *     tags: [Applications]
 *     summary: Application statistics
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Stats } }
 * /api/v1/applications/{id}:
 *   get:
 *     tags: [Applications]
 *     summary: Get one application
 *     security: [ { bearerAuth: [] } ]
 *   patch:
 *     tags: [Applications]
 *     summary: Update status (client)
 *     security: [ { bearerAuth: [] } ]
 *   delete:
 *     tags: [Applications]
 *     summary: Delete my application (student)
 *     security: [ { bearerAuth: [] } ]
 * /api/v1/applications/{id}/withdraw:
 *   patch:
 *     tags: [Applications]
 *     summary: Withdraw application (student)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Withdrawn } }
 * /api/v1/applications/{id}/accept:
 *   patch:
 *     tags: [Applications]
 *     summary: Accept application (client)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Accepted } }
 * /api/v1/applications/{id}/reject:
 *   patch:
 *     tags: [Applications]
 *     summary: Reject application (client)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Rejected } }
 * /api/v1/applications/check/{jobId}:
 *   get:
 *     tags: [Applications]
 *     summary: Check if student applied to job
 *     security: [ { bearerAuth: [] } ]
 *     parameters: [ { in: path, name: jobId, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: Status } }
 * /api/v1/applications/apply/{jobId}:
 *   post:
 *     tags: [Applications]
 *     summary: Apply to job
 *     security: [ { bearerAuth: [] } ]
 *     parameters: [ { in: path, name: jobId, required: true, schema: { type: string } } ]
 *     requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses: { 201: { description: Application created } }
 * /api/v1/applications/job/{jobId}:
 *   get:
 *     tags: [Applications]
 *     summary: Applications for a job (client)
 *     security: [ { bearerAuth: [] } ]
 *     parameters: [ { in: path, name: jobId, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: List } }
 * /api/v1/applications/{id}/unlock-contact:
 *   patch:
 *     tags: [Applications]
 *     summary: Unlock student contact (client, uses points)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Unlocked } }
 */
/**
 * @openapi
 * /api/v1/verifications/upload:
 *   post:
 *     tags: [Verifications]
 *     summary: Upload verification document
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema: { type: object, properties: { document: { type: string, format: binary } } }
 *     responses: { 201: { description: Uploaded } }
 * /api/v1/verifications/me:
 *   get:
 *     tags: [Verifications]
 *     summary: My verifications
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/verifications/status:
 *   get:
 *     tags: [Verifications]
 *     summary: Verification status
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Status } }
 * /api/v1/verifications/pending:
 *   get:
 *     tags: [Verifications]
 *     summary: All pending (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/verifications/stats:
 *   get:
 *     tags: [Verifications]
 *     summary: Verification stats (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Stats } }
 * /api/v1/verifications:
 *   get:
 *     tags: [Verifications]
 *     summary: All verifications (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/verifications/{id}:
 *   get:
 *     tags: [Verifications]
 *     summary: Get verification by id (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: One verification } }
 * /api/v1/verifications/{id}/approve:
 *   patch:
 *     tags: [Verifications]
 *     summary: Approve (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 * /api/v1/verifications/{id}/reject:
 *   patch:
 *     tags: [Verifications]
 *     summary: Reject (admin)
 *     security: [ { bearerAuth: [] } ]
 *     requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses: { 200: { description: OK } }
 */
/**
 * @openapi
 * /api/v1/subscriptions/pricing:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Public subscription pricing
 *     responses: { 200: { description: Pricing } }
 * /api/v1/subscriptions/me:
 *   get:
 *     tags: [Subscriptions]
 *     summary: My subscription
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Subscription } }
 * /api/v1/subscriptions/check-limit:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Check application limit
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Limit info } }
 * /api/v1/subscriptions/upgrade:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Upgrade to premium
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 * /api/v1/subscriptions/cancel:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Cancel subscription
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 * /api/v1/subscriptions/renew:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Renew subscription
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 * /api/v1/subscriptions/history:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Subscription history
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/subscriptions:
 *   get:
 *     tags: [Subscriptions]
 *     summary: All subscriptions (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/subscriptions/stats:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Subscription stats (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Stats } }
 */
/**
 * @openapi
 * /api/v1/packages/available:
 *   get:
 *     tags: [Packages]
 *     summary: Available client packages
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/packages/purchase:
 *   post:
 *     tags: [Packages]
 *     summary: Purchase package (client)
 *     security: [ { bearerAuth: [] } ]
 *     requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses: { 201: { description: OK } }
 * /api/v1/packages/active:
 *   get:
 *     tags: [Packages]
 *     summary: My active package (client)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Package } }
 * /api/v1/packages/history:
 *   get:
 *     tags: [Packages]
 *     summary: My package history (client)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/packages/points-balance:
 *   get:
 *     tags: [Packages]
 *     summary: Points balance (client)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Balance } }
 * /api/v1/packages/cancel:
 *   patch:
 *     tags: [Packages]
 *     summary: Cancel package (client)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 * /api/v1/packages/all:
 *   get:
 *     tags: [Packages]
 *     summary: All packages (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/packages/stats:
 *   get:
 *     tags: [Packages]
 *     summary: Package stats (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Stats } }
 */
/**
 * @openapi
 * /api/v1/profiles/{studentId}/anonymized:
 *   get:
 *     tags: [Profiles]
 *     summary: Anonymized student profile preview
 *     security: [ { bearerAuth: [] } ]
 *     parameters: [ { in: path, name: studentId, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: Profile } }
 * /api/v1/profiles/unlock:
 *   post:
 *     tags: [Profiles]
 *     summary: Unlock profile (client, uses points)
 *     security: [ { bearerAuth: [] } ]
 *     requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses: { 200: { description: OK } }
 * /api/v1/profiles/viewed:
 *   get:
 *     tags: [Profiles]
 *     summary: Profiles I viewed (client)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/profiles/unlocked-students:
 *   get:
 *     tags: [Profiles]
 *     summary: Unlocked students (client)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/profiles/shortlisted:
 *   get:
 *     tags: [Profiles]
 *     summary: Shortlisted profiles (client)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/profiles/shortlist:
 *   post:
 *     tags: [Profiles]
 *     summary: Shortlist a profile (client)
 *     security: [ { bearerAuth: [] } ]
 *     requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses: { 201: { description: OK } }
 * /api/v1/profiles/action:
 *   patch:
 *     tags: [Profiles]
 *     summary: Update shortlist or profile action (client)
 *     security: [ { bearerAuth: [] } ]
 *     requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses: { 200: { description: OK } }
 * /api/v1/profiles/student/{studentId}:
 *   get:
 *     tags: [Profiles]
 *     summary: Full student profile (client, requires unlock)
 *     security: [ { bearerAuth: [] } ]
 *     parameters: [ { in: path, name: studentId, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: Profile } }
 * /api/v1/profiles/viewers:
 *   get:
 *     tags: [Profiles]
 *     summary: Who viewed my profile (student)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/profiles:
 *   get:
 *     tags: [Profiles]
 *     summary: All profile views (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/profiles/stats:
 *   get:
 *     tags: [Profiles]
 *     summary: Profile view stats (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Stats } }
 */
/**
 * @openapi
 * /api/v1/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List my notifications
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/notifications/system:
 *   post:
 *     tags: [Notifications]
 *     summary: Create system notification (admin only)
 *     security: [ { bearerAuth: [] } ]
 *     requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses: { 201: { description: Created } }
 * /api/v1/notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Unread count
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Count } }
 * /api/v1/notifications/settings:
 *   get:
 *     tags: [Notifications]
 *     summary: Notification settings
 *     security: [ { bearerAuth: [] } ]
 *   patch:
 *     tags: [Notifications]
 *     summary: Update settings
 *     security: [ { bearerAuth: [] } ]
 *     requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses: { 200: { description: OK } }
 * /api/v1/notifications/{id}:
 *   get:
 *     tags: [Notifications]
 *     summary: Get one notification
 *     security: [ { bearerAuth: [] } ]
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete notification
 *     security: [ { bearerAuth: [] } ]
 * /api/v1/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark as read
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 * /api/v1/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all as read
 *     security: [ { bearerAuth: [] } ]
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete all read
 *     security: [ { bearerAuth: [] } ]
 */
/**
 * @openapi
 * /api/v1/transactions/me:
 *   get:
 *     tags: [Transactions]
 *     summary: My transactions
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/transactions/summary:
 *   get:
 *     tags: [Transactions]
 *     summary: Transaction summary
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Summary } }
 * /api/v1/transactions/{id}:
 *   get:
 *     tags: [Transactions]
 *     summary: Get transaction
 *     security: [ { bearerAuth: [] } ]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: One transaction } }
 * /api/v1/transactions:
 *   get:
 *     tags: [Transactions]
 *     summary: All transactions (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/transactions/revenue-stats:
 *   get:
 *     tags: [Transactions]
 *     summary: Revenue stats (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Stats } }
 * /api/v1/transactions/{id}/refund:
 *   post:
 *     tags: [Transactions]
 *     summary: Process refund (admin)
 *     security: [ { bearerAuth: [] } ]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses: { 200: { description: OK } }
 * /api/v1/transactions/{id}/status:
 *   patch:
 *     tags: [Transactions]
 *     summary: Update transaction status (admin)
 *     security: [ { bearerAuth: [] } ]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses: { 200: { description: OK } }
 */
/**
 * @openapi
 * /api/v1/admin/stats:
 *   get: { tags: [Admin], summary: Dashboard stats, security: [ { bearerAuth: [] } ], responses: { 200: { description: OK } } }
 * /api/v1/admin/platform-settings:
 *   get: { tags: [Admin], summary: Get platform settings, security: [ { bearerAuth: [] } ], responses: { 200: { description: OK } } }
 *   patch: { tags: [Admin], summary: Update platform settings, security: [ { bearerAuth: [] } ], requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } }, responses: { 200: { description: OK } } }
 * /api/v1/admin/platform-income:
 *   get: { tags: [Admin], summary: Platform income, security: [ { bearerAuth: [] } ], responses: { 200: { description: OK } } }
 * /api/v1/admin/analytics:
 *   get: { tags: [Admin], summary: Analytics, security: [ { bearerAuth: [] } ], responses: { 200: { description: OK } } }
 * /api/v1/admin/packages:
 *   get: { tags: [Admin], summary: All packages, security: [ { bearerAuth: [] } ] }
 *   post: { tags: [Admin], summary: Create package, security: [ { bearerAuth: [] } ], requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } } }
 * /api/v1/admin/packages/{id}:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ], parameters: [ { in: path, name: id, required: true, schema: { type: string } } ] }
 *   patch: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 *   delete: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/users:
 *   get: { tags: [Admin], summary: All users, security: [ { bearerAuth: [] } ], responses: { 200: { description: List } } }
 * /api/v1/admin/users/{id}:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 *   delete: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/users/{id}/suspend:
 *   patch: { tags: [Admin], summary: Suspend/unsuspend user, security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/users/{id}/verify:
 *   patch: { tags: [Admin], summary: Toggle verification, security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/students/verification:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/verifications/{id}/approve:
 *   patch: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/verifications/{id}/reject:
 *   patch: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/applications:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/jobs:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/contracts:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/withdrawals:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/withdrawals/{id}:
 *   patch: { tags: [Admin], summary: Update withdrawal (multipart `paymentEvidence`), security: [ { bearerAuth: [] } ], requestBody: { content: { multipart/form-data: { schema: { type: object, properties: { paymentEvidence: { type: string, format: binary } } } } } } }
 * /api/v1/admin/appeals:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/appeals/{id}/status:
 *   patch: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/appeals/{id}/resolve:
 *   post: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/appeals/{id}/admin-note:
 *   post: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/logs/files:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/logs/stats:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/logs/{date}:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 *   delete: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/universities:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 *   post: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/universities/{id}:
 *   get: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 *   patch: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 *   delete: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/universities/{id}/approve:
 *   patch: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 * /api/v1/admin/universities/{id}/reject:
 *   patch: { tags: [Admin], security: [ { bearerAuth: [] } ] }
 */
/**
 * @openapi
 * /api/v1/paymob/webhook:
 *   post: { tags: [Paymob], summary: Paymob IPN, responses: { 200: { description: OK } } }
 * /api/v1/paymob/success: { get: { tags: [Paymob], summary: Success redirect, responses: { 200: { description: OK } } } }
 * /api/v1/paymob/{id}/payment/success: { get: { tags: [Paymob], parameters: [ { in: path, name: id, required: true, schema: { type: string } } ], responses: { 200: { description: OK } } } }
 * /api/v1/paymob/complete-success: { get: { tags: [Paymob], responses: { 200: { description: OK } } } }
 * /api/v1/paymob/payment-status:
 *   get: { tags: [Paymob], responses: { 200: { description: Status } } }
 *   post: { tags: [Paymob], responses: { 200: { description: Status } } }
 */
/**
 * @openapi
 * /api/v1/paypal/capture: { get: { tags: [PayPal], summary: PayPal return URL, responses: { 200: { description: OK } } } }
 * /api/v1/paypal/orders:
 *   post: { tags: [PayPal], summary: Create PayPal order, security: [ { bearerAuth: [] } ], requestBody: { content: { application/json: { schema: { type: object, additionalProperties: true } } } } }
 */
/**
 * @openapi
 * /api/v1/coupons/featured: { get: { tags: [Coupons], security: [ { bearerAuth: [] } ] } }
 * /api/v1/coupons/code/{code}: { get: { tags: [Coupons], security: [ { bearerAuth: [] } ], parameters: [ { in: path, name: code, required: true, schema: { type: string } } ] } }
 * /api/v1/coupons: { get: { tags: [Coupons], security: [ { bearerAuth: [] } ] }, post: { tags: [Coupons, Admin], security: [ { bearerAuth: [] } ] } }
 * /api/v1/coupons/{id}: { get: { tags: [Coupons], security: [ { bearerAuth: [] } ] }, patch: { tags: [Coupons, Admin], security: [ { bearerAuth: [] } ] }, delete: { tags: [Coupons, Admin], security: [ { bearerAuth: [] } ] } }
 * /api/v1/coupons/{id}/redeem: { post: { tags: [Coupons], security: [ { bearerAuth: [] } ] } }
 * /api/v1/coupons/validate: { post: { tags: [Coupons], security: [ { bearerAuth: [] } ] } }
 * /api/v1/coupons/record-usage: { post: { tags: [Coupons], security: [ { bearerAuth: [] } ] } }
 * /api/v1/coupons/{id}/toggle-active: { patch: { tags: [Coupons, Admin], security: [ { bearerAuth: [] } ] } }
 * /api/v1/coupons/{id}/stats: { get: { tags: [Coupons, Admin], security: [ { bearerAuth: [] } ] } }
 */
/**
 * @openapi
 * /api/v1/startups:
 *   get:
 *     tags: [Startups, Admin]
 *     summary: All startups (admin) or list scope per controller
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 *   post:
 *     tags: [Startups]
 *     summary: Create startup (client)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 201: { description: Created } }
 * /api/v1/startups/me:
 *   get:
 *     tags: [Startups]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/startups/{id}:
 *   get:
 *     tags: [Startups, Admin]
 *     security: [ { bearerAuth: [] } ]
 *   patch:
 *     tags: [Startups]
 *     security: [ { bearerAuth: [] } ]
 *   delete:
 *     tags: [Startups]
 *     security: [ { bearerAuth: [] } ]
 * /api/v1/startups/{id}/logo:
 *   post:
 *     tags: [Startups]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               logo: { type: string, format: binary }
 *     responses: { 200: { description: OK } }
 *   delete:
 *     tags: [Startups]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 */
/**
 * @openapi
 * /api/v1/contacts:
 *   get:
 *     tags: [Contacts, Admin]
 *     summary: List contacts (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 *   post:
 *     tags: [Contacts]
 *     summary: Submit contact form (public, no auth)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, additionalProperties: true }
 *     responses: { 201: { description: Created } }
 * /api/v1/contacts/stats:
 *   get:
 *     tags: [Contacts, Admin]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: Stats } }
 * /api/v1/contacts/{id}:
 *   get:
 *     tags: [Contacts, Admin]
 *     security: [ { bearerAuth: [] } ]
 *   delete:
 *     tags: [Contacts, Admin]
 *     security: [ { bearerAuth: [] } ]
 * /api/v1/contacts/{id}/status:
 *   patch:
 *     tags: [Contacts, Admin]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 * /api/v1/contacts/{id}/reply:
 *   post:
 *     tags: [Contacts, Admin]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 */
/**
 * @openapi
 * /api/v1/categories:
 *   get:
 *     tags: [Categories]
 *     summary: List active categories (public)
 *     responses: { 200: { description: List } }
 *   post:
 *     tags: [Categories, Admin]
 *     summary: Create category (admin)
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 201: { description: Created } }
 * /api/v1/categories/admin/all:
 *   get:
 *     tags: [Categories, Admin]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/categories/{id}:
 *   get:
 *     tags: [Categories]
 *     summary: Get category (public)
 *     responses: { 200: { description: One category } }
 *   patch:
 *     tags: [Categories, Admin]
 *     security: [ { bearerAuth: [] } ]
 *   delete:
 *     tags: [Categories, Admin]
 *     security: [ { bearerAuth: [] } ]
 * /api/v1/categories/{id}/hard:
 *   delete:
 *     tags: [Categories, Admin]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 */
/**
 * @openapi
 * /api/v1/universities: { get: { tags: [Universities], summary: List universities } }
 * /api/v1/universities/{id}: { get: { tags: [Universities] } }
 * /api/v1/universities/pending: { post: { tags: [Universities], security: [ { bearerAuth: [] } ], summary: Submit pending university } }
 */
/**
 * @openapi
 * /api/v1/grantings: { get: { tags: [Grantings, Admin], security: [ { bearerAuth: [] } ] }, post: { tags: [Grantings], security: [ { bearerAuth: [] } ] } }
 * /api/v1/grantings/me: { get: { tags: [Grantings], security: [ { bearerAuth: [] } ] } }
 * /api/v1/grantings/stats: { get: { tags: [Grantings, Admin], security: [ { bearerAuth: [] } ] } }
 */
/**
 * @openapi
 * /api/v1/logs: { post: { tags: [Logs], summary: Log frontend error (no auth) } }
 */
/**
 * @openapi
 * /api/v1/moderator/verifications/pending: { get: { tags: [Moderator], security: [ { bearerAuth: [] } ] } }
 * /api/v1/moderator/verifications: { get: { tags: [Moderator], security: [ { bearerAuth: [] } ] } }
 * /api/v1/moderator/verifications/{id}:
 *   get: { tags: [Moderator], security: [ { bearerAuth: [] } ] }
 * /api/v1/moderator/verifications/{id}/approve: { patch: { tags: [Moderator], security: [ { bearerAuth: [] } ] } }
 * /api/v1/moderator/verifications/{id}/reject: { patch: { tags: [Moderator], security: [ { bearerAuth: [] } ] } }
 * /api/v1/moderator/universities: { get: { tags: [Moderator], security: [ { bearerAuth: [] } ] } }
 * /api/v1/moderator/universities/{id}/approve: { patch: { tags: [Moderator], security: [ { bearerAuth: [] } ] } }
 * /api/v1/moderator/universities/{id}/reject: { patch: { tags: [Moderator], security: [ { bearerAuth: [] } ] } }
 */
/**
 * @openapi
 * /api/v1/contracts/me: { get: { tags: [Contracts], security: [ { bearerAuth: [] } ] } }
 * /api/v1/contracts/from-application/{applicationId}: { post: { tags: [Contracts], security: [ { bearerAuth: [] } ] } }
 * /api/v1/contracts/{id}: { get: { tags: [Contracts], security: [ { bearerAuth: [] } ] }, patch: { tags: [Contracts], security: [ { bearerAuth: [] } ] } }
 * /api/v1/contracts/{id}/sign: { post: { tags: [Contracts], security: [ { bearerAuth: [] } ] } }
 * /api/v1/contracts/{id}/confirm-changes: { post: { tags: [Contracts], security: [ { bearerAuth: [] } ] } }
 * /api/v1/contracts/{id}/milestones/{milestoneId}/fund: { post: { tags: [Contracts], security: [ { bearerAuth: [] } ] } }
 * /api/v1/contracts/{id}/milestones/{milestoneId}/submit: { post: { tags: [Contracts], security: [ { bearerAuth: [] } ] } }
 * /api/v1/contracts/{id}/milestones/{milestoneId}/approve: { post: { tags: [Contracts], security: [ { bearerAuth: [] } ] } }
 * /api/v1/contracts/{id}/complete-after-appeal: { post: { tags: [Contracts], security: [ { bearerAuth: [] } ] } }
 * /api/v1/contracts/{id}/cancel-after-appeal: { post: { tags: [Contracts], security: [ { bearerAuth: [] } ] } }
 */
/**
 * @openapi
 * /api/v1/appeals:
 *   post:
 *     tags: [Appeals]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 201: { description: Created } }
 * /api/v1/appeals/me:
 *   get:
 *     tags: [Appeals]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: List } }
 * /api/v1/appeals/{id}:
 *   get:
 *     tags: [Appeals]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: One appeal } }
 * /api/v1/appeals/{id}/documents:
 *   post:
 *     tags: [Appeals]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               document: { type: string, format: binary }
 *     responses: { 200: { description: OK } }
 * /api/v1/appeals/{id}/messages:
 *   post:
 *     tags: [Appeals]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 * /api/v1/appeals/{id}/close:
 *   post:
 *     tags: [Appeals]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 * /api/v1/appeals/{id}/cancel-contract:
 *   post:
 *     tags: [Appeals]
 *     security: [ { bearerAuth: [] } ]
 *     responses: { 200: { description: OK } }
 */
module.exports = {};
