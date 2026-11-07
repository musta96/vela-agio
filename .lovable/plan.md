# Restore account and billing emails

## Confirmed issue
Vela calls a missing email sender. Cancellation and digest code confirms these calls have no working fallback, matching the recorded NOT_FOUND failure. No sending domain is configured, so adding a sender alone cannot restore delivery.

## Required first step
Configure a real domain you own through **Set up email domain**. Existing sign-in emails are separate; this work restores app-generated account and billing messages.

## Implementation
- Set up the shared email infrastructure and sender after the domain is selected. Sending begins only after domain verification.
- Add branded templates for trial confirmation, cancellation, payment failures and trial-ending account notices; include only necessary account information, without promotions.
- Update existing triggers to use validated template data, stable event-based duplicate protection and explicit send-error handling. Keep billing actions independent of email delivery.
- Restrict recipient selection to trusted account events so the sender cannot be used to email arbitrary addresses.
- Add the required unsubscribe page and retain the service's mandatory unsubscribe footer. Unsubscribing from app emails must not interfere with sign-in or password-reset emails.
- Keep scheduled market digests and morning briefs outside the built-in app-email service: it does not support bulk scheduled digests. Their email delivery requires a separate appropriate service; preserve their existing in-app and push behavior.

## Verification
- Test template validation, unauthorized sends, duplicate prevention and surfaced delivery failures.
- Exercise one account-event email end to end with an approved recipient and confirm sending status; do not trigger real cancellations or payment changes merely to test email.
- Mark the monitoring finding fixed only after eligible account/billing messages work; report market digest email delivery separately until its service is connected.

## Technical details
Use the platform-managed queue and single `send-transactional-email` function, React Email templates with escaped props, and authenticated trusted triggers. Do not build queue infrastructure manually or accept raw HTML email payloads.