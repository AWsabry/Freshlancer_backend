# Email (SendGrid SMTP)

All transactional and admin emails are sent from the API via **nodemailer** over SMTP. The transporter is configured in `utils/email/emailTransporter.js`; templates live in `utils/email/emailTemplates.js`.

## Environment variables

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | `smtp.sendgrid.net` for SendGrid |
| `SMTP_PORT` | `587` (STARTTLS) or `465` (SSL) |
| `SMTP_SECURE` | `false` for port 587, `true` for port 465 |
| `SMTP_USER` | `apikey` (literal; required by SendGrid SMTP) |
| `SMTP_PASS` | SendGrid API key with **Mail Send** permission |
| `EMAIL_FROM` | Verified sender address (e.g. `noreply@freshlancer.online`) |
| `EMAIL_FROM_NAME` | Display name (e.g. `Freshlancer Team`) |
| `EMAIL_DOMAIN` | Domain for support links in templates |
| `EMAIL_LOGO_URL` | Logo URL in HTML emails |
| `FRONTEND_URL` | Base URL for verification/reset links |
| `ADMIN_EMAIL` | Recipient for backup notifications |

If `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are unset, the API falls back to **Ethereal Email** (preview URLs in server logs only; no real delivery).

## SendGrid setup

1. In SendGrid, verify your **single sender** or **domain** for `EMAIL_FROM`.
2. Create an API key with Mail Send permission.
3. Set env (see `.config.development.env` / production `config.env`):

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=<your-sendgrid-api-key>
EMAIL_FROM=noreply@freshlancer.online
EMAIL_FROM_NAME=Freshlancer Team
```

4. Restart the API. On startup you should see: `Using configured SMTP service: smtp.sendgrid.net`.

`SMTP_USER` is only for SMTP authentication. The visible **From** header uses `EMAIL_FROM` and `EMAIL_FROM_NAME` via `getEmailFrom()` in `utils/email/emailConstants.js`.

## Manual test checklist

1. Sign up → welcome / verification email with link `{FRONTEND_URL}/verify-email/:token`
2. Resend verification (`POST /api/v1/users/resendVerificationEmail`)
3. Forgot password → reset link email
4. Admin email center → send a test to yourself; confirm From is `Freshlancer Team <noreply@...>`
5. SendGrid **Activity** feed → delivered / bounced status

## Admin Email Center (marketing campaigns)

Admins send bulk campaigns from **Email Center** (`/admin/emails` in the frontend). The API routes are:

- `POST /api/v1/admin/emails/preview`
- `POST /api/v1/admin/emails/send`
- `GET /api/v1/admin/emails`
- `GET /api/v1/admin/emails/:id`

Delivery uses **SendGrid**, not a separate mail server:

| `EMAIL_PROVIDER` | Behavior |
|------------------|----------|
| `smtp` (default) | Nodemailer → SendGrid **SMTP relay** (`smtp.sendgrid.net`) |
| `sendgrid-api` or `sendgrid` | **SendGrid Web API** (`@sendgrid/mail`) |

Set `SENDGRID_API_KEY` for Web API, or use `SMTP_PASS` as the API key when `SMTP_HOST` is SendGrid.

Optional: `ADMIN_EMAIL_SEND_DELAY_MS` (e.g. `150`) throttles sends between recipients/chunks.

Transactional emails (`sendEmail` templates) still use the SMTP transporter in `emailTransporter.js`.

## Email features using this stack

- Signup / resend verification (`welcome`, `resend-verification`)
- Password reset (`password-reset`, `password-reset-confirmation`)
- Jobs, contracts, payments, withdrawals, appeals, contact form, backups, inactive-user reminders, admin campaigns
