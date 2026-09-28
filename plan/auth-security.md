# Auth & account security

Email verification, password reset, email sign-in codes, 2FA (authenticator app + email OTP + recovery codes),
optional mobile number, new-sign-in alerts, and risk-based step-up ("unusual sign-in → ask for a second factor").

Builds on `internal/auth` (password hashing, opaque session tokens stored as SHA-256), `internal/platform/mailer`
(SMTP + asynq task, log mailer in dev), and `internal/platform/secrets` (AES-256-GCM) for TOTP secrets.

## Principles

- No account enumeration: forgot-password, email-code start and resend always return 200 with the same body.
- Every code/token: random, stored hashed (SHA-256), single use, short expiry, max 5 attempts, then dead.
  Sends are rate limited: 60 s between sends, 5 per hour per (purpose, email).
- Constant-time comparisons. Codes are 6 digits; link tokens are 32 random bytes, base64url.
- Password reset and password change revoke all other sessions and email a notice.
- Sensitive settings changes (2FA on/off, recovery codes, phone, password) require the current password.
- Lockout: 5 failed password attempts for an email within 15 min → further attempts for that email are refused for
  15 min (generic error) and a "someone is trying to sign in" email is sent once.

## Data (migration `00051_auth_security.sql`; use the next free number)

`users` add: `email_verified_at timestamptz`, `phone text` (E.164), `phone_verified_at timestamptz`,
`totp_secret_enc bytea`, `totp_enabled_at timestamptz`, `totp_last_step bigint` (replay guard),
`email_2fa_enabled boolean NOT NULL DEFAULT false`, `password_changed_at timestamptz`.
Existing users: set `email_verified_at = created_at` (they're grandfathered; invitees proved their email).

`auth_codes`: id, user_id (nullable), email citext, purpose (`verify_email` | `login_email` | `reset_password` |
`two_factor_email` | `verify_phone`), code_hash bytea, token_hash bytea null (reset links), attempts int,
data jsonb (e.g. pending phone), created_ip, expires_at, consumed_at, created_at.
Expiry: verify_email 24 h, reset_password 1 h, others 10 min.

`auth_challenges` (pending second factor after first factor succeeded): id, user_id, token_hash (the
challenge id handed to the client is a random token, not the row id), reason (`two_factor` | `new_device` |
`failed_attempts`), methods text[], remember_device bool, ip, user_agent, attempts, expires_at (10 min), consumed_at.

`recovery_codes`: user_id, code_hash, used_at. 10 codes, format `xxxx-xxxx`.

`known_devices`: id, user_id, device_hash (SHA-256 of the `adwise_device` cookie value, a random 32-byte token,
HttpOnly, 1 year), label (parsed from UA: "Chrome on macOS"), last_ip, first_seen_at, last_seen_at,
trusted_until timestamptz (set when user ticks "remember this device", 30 days).

`auth_events`: id, user_id null, email citext, type (`login_succeeded`, `login_failed`, `challenge_issued`,
`challenge_passed`, `challenge_failed`, `password_reset`, `password_changed`, `email_verified`, `totp_enabled`,
`totp_disabled`, `email_2fa_enabled`, `email_2fa_disabled`, `recovery_codes_regenerated`, `recovery_code_used`,
`phone_added`, `phone_verified`, `phone_removed`, `device_removed`, `sessions_revoked`), ip, user_agent, created_at.
Used for lockout counting and the "Recent security activity" list. Keep 180 days.

## Risk: when to ask for a second factor

After the password (or email sign-in code) checks out:
1. If TOTP or email-2FA is enabled → challenge, unless this device is `trusted_until > now()`.
2. Else if the sign-in is **unusual** → challenge with email OTP. Unusual = device cookie unknown for this user
   **and** the IP's /24 (IPv4) or /48 (IPv6) hasn't had a successful sign-in for this user in 90 days, **or**
   there were ≥3 failed attempts for this email in the last 15 min.
   A user's very first sign-in after signup is not unusual.
3. Methods offered: `totp` (if enabled), `email` (always: to the verified email), `recovery` (if TOTP enabled).
   With an email-code sign-in (the email is the first factor), `email` is not offered as the second factor;
   if the user has no TOTP, an email-code sign-in counts as complete.

After success: create session, upsert known device (set/refresh cookie), and if the device was new send the
**new sign-in alert** email (time, approx. location = IP, device label, "Wasn't you? Reset your password" link).

## Phone number (add-on)

Optional `phone` on the profile, verified by a 6-digit SMS code. SMS goes through an `sms.Sender` interface in
`internal/platform/sms` with a log sender (dev/default) and a Twilio sender when `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_FROM` are set. v1 uses the phone for account recovery contact only; it is **not**
a 2FA method (SMS is the weakest factor; can be added later).

## Emails (plain, on-brand; reuse mailer templates)

verify email code · sign-in code · 2FA code · password reset link (+ code) · new sign-in alert ·
password changed · 2FA turned on/off · recovery codes regenerated · too many failed attempts.
Links use the existing app base URL config used by invitation emails.

## API (all under the existing auth router, JSON; errors via httpx)

Public:
- `POST /auth/signup` {name, email, password} → `{status:"ok", user}` + session cookie; sends verify-email code.
- `POST /auth/login` {email, password, remember_device?} → `LoginResult`
- `POST /auth/login/code/start` {email} → 200 `{}` (always)
- `POST /auth/login/code/verify` {email, code, remember_device?} → `LoginResult`
- `POST /auth/challenge/email` {challenge} → 200 `{}` (sends the 2FA email code)
- `POST /auth/challenge/verify` {challenge, method: "totp"|"email"|"recovery", code, remember_device?} → `LoginResult`
- `POST /auth/password/forgot` {email} → 200 `{}` (always)
- `POST /auth/password/reset` {token, password} → `{status:"ok"}` (does not sign in; revokes sessions)

Authenticated:
- `GET /auth/me` → existing shape **plus** `email_verified: boolean`, `two_factor_enabled: boolean`
- `POST /auth/email/verify` {code} → `{email_verified:true}`
- `POST /auth/email/resend` → 200 `{}`
- `POST /auth/password/change` {current_password, new_password} → 200 `{}` (keeps this session, revokes others)
- `GET /auth/security` → `SecurityOverview`
- `POST /auth/2fa/totp/setup` {password} → {secret, otpauth_url}
- `POST /auth/2fa/totp/enable` {code} → {recovery_codes: string[]}
- `POST /auth/2fa/totp/disable` {password, code} → 200
- `POST /auth/2fa/email` {password, enabled: boolean} → 200
- `POST /auth/2fa/recovery-codes` {password} → {recovery_codes: string[]}
- `POST /auth/phone` {password, phone} → 200 (sends SMS code) · `POST /auth/phone/verify` {code} → 200 ·
  `DELETE /auth/phone` (body {password}) → 200
- `DELETE /auth/devices/{id}` → 200 · `POST /auth/sessions/revoke-others` → {revoked: number}

```ts
type LoginResult =
  | { status: "ok"; user: Me }
  | { status: "challenge"; challenge: string; methods: ("totp" | "email" | "recovery")[];
      reason: "two_factor" | "new_device" | "failed_attempts"; email_hint: string /* v***@gmail.com */ };
type SecurityOverview = {
  email: string; email_verified: boolean;
  phone: string | null; phone_verified: boolean;
  totp_enabled: boolean; email_2fa_enabled: boolean; recovery_codes_remaining: number;
  password_changed_at: string | null;
  devices: { id: string; label: string; last_ip: string; last_seen_at: string; trusted: boolean; current: boolean }[];
  sessions_count: number;
  events: { type: string; ip: string; user_agent: string; created_at: string }[]; // latest 20
};
```
Error codes (httpx `code` field) the UI keys on: `invalid_credentials`, `too_many_attempts`, `invalid_code`,
`code_expired`, `challenge_expired`, `password_required`, `weak_password`, `invalid_phone`, `rate_limited`.

## Web

- Login: password form → on `challenge`, a step with a 6-box OTP input, method switcher (authenticator / email me
  a code / recovery code), "Remember this device for 30 days", clear reason copy ("New device — confirm it's you").
  "Email me a sign-in code instead" link → email → code step. "Forgot password?" link.
- `/forgot-password`, `/reset-password?token=…` (strength meter), `/verify-email` (code input + resend with
  cooldown; app layout redirects here when `email_verified` is false; add to proxy matcher).
- Settings → **Security** tab: password change; two-step verification card (authenticator setup with QR via the
  `qrcode` package + manual key, confirm code, show/download recovery codes once; email OTP toggle;
  regenerate codes); phone number add/verify/remove; devices list (remove, "this device"); sign out other
  sessions; recent security activity.
