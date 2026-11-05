# Vela Apple subscriptions: setup and verification

## Implemented

- Plus, Pro and Enterprise include `ai.backtests`, `strategy.proposal_builder`, `strategy.lab`, `backtest.costs`, `backtest.advanced` and `backtest.events`.
- iOS upgrade pages/dialogs and Plans & Billing use Apple purchases, not website checkout.
- RevenueCat SDK 14 handles purchase and restore with the authenticated Vela UUID as its customer ID. Device identifier collection and diagnostics are disabled.
- The server reads verified RevenueCat subscription state through the connected RevenueCat service. Only purchased App Store subscriptions for the original Vela customer and approved products qualify.
- Separate Apple records preserve website billing. Cancellation preserves paid-period access; expiry and provider revocation remove it. Client claims never authorize access.
- Pro's existing 2,000/calendar-month hosted AI allowance remains unchanged. Temporary beta/own-provider behavior and AI opt-out remain unchanged.
- Production purchases grant regular access. Sandbox purchases grant access only to explicitly allowed test/review accounts, never arbitrary users. RevenueCat's sample Test Store is not accepted.

## Verified service configuration on 5 November 2026

The connected RevenueCat project currently contains only the sample **Test Store**, with `monthly`, `yearly` and `lifetime` sample products. These are not Apple subscriptions. No real Apple product or iOS public SDK key was verified. Purchases remain unavailable rather than simulating success.

The private RevenueCat API connection and webhook authorization secret are stored securely. Creating an API connection does not configure Apple's products, prices, credentials or notifications.

## Required Apple and RevenueCat setup

1. Complete Apple's paid-app agreement, banking and tax requirements in App Store Connect.
2. Add Vela's actual iOS app to RevenueCat, using its bundle identifier from `capacitor.config.json`; do not use RevenueCat's sample Test Store.
3. Create one Apple auto-renewable subscription group for Vela Pro with:
   - `vela_pro_monthly`: one month; requested base price €29.
   - `vela_pro_yearly`: one year; requested base price €288.
   Select available Apple price points and local storefront prices. The app displays Apple's localized price, not a hardcoded amount.
4. Put both Pro products at the same service level. Apple determines monthly/yearly crossgrade timing. If lower/higher plans are added later, use appropriate group levels for immediate upgrades and renewal-time downgrades. Do not promise timing different from Apple's confirmed transaction.
5. Supply Apple's required In-App Purchase credentials to RevenueCat, and configure Apple's server notifications using RevenueCat's official instructions. Do not paste private Apple keys into chat.
6. Import the two Apple products into RevenueCat. Attach them to the Pro entitlement and the current offering's monthly and annual packages. The server also verifies exact product identifiers and duration.
7. Set RevenueCat restore/transfer behavior to **Keep with original App User ID**, disable Family Sharing for these products and require a signed-in Vela account before purchases. A purchase cannot move between Vela accounts.
8. Send the iOS **public SDK key** (`appl_…`) to the builder; this is public, not the secret API key. It is stored in the server-only purchase configuration and returned only for SDK configuration. Do not use a `test_…` key.
9. Configure the RevenueCat renewal webhook to the deployed `revenuecat-webhook` function. Copy its actual invocation URL from Lovable Cloud's Functions view; do not use the website URL. Paste the generated authorization value into RevenueCat's Authorization header exactly as stored, with no extra `Bearer ` prefix unless included in the saved value. Send events for both sandbox and production. Send RevenueCat's test event and check a successful response.
10. Register each Vela test/reviewer UUID in `apple_test_accounts` through a trusted administrator operation before sandbox testing. This allowlist does not grant access by itself; a verified sandbox Apple subscription is still required. Remove test accounts from the allowlist after testing when appropriate.

## Mac and native project

Update your local project from the connected repository. In its project folder run:

```bash
npm install
npm run build
npx cap sync ios
npx cap open ios
```

In Xcode enable In-App Purchase capability and verify Swift 5+ and RevenueCat's native package integration. If the project uses Swift Package Manager, confirm RevenueCat dependencies resolve there; otherwise use the supported CocoaPods integration. Build and sign on a Mac, then upload with Xcode. No signed archive or upload was produced in the Linux environment.

See the [Capacitor guide](https://lovable.dev/blog/capacitor) and [RevenueCat Capacitor installation](https://www.revenuecat.com/docs/getting-started/installation/capacitor).

## End-to-end release checklist

- [ ] A non-beta free Vela test user is explicitly allowlisted for Apple sandbox access.
- [ ] Apple localized monthly/yearly prices match the chosen App Store Connect prices.
- [ ] Buying monthly through Apple's sandbox sheet verifies on the server and enables a real strategy preview and full backtest.
- [ ] Cancelling Apple's payment sheet leaves access and billing unchanged.
- [ ] Pending payment does not unlock tools until approval.
- [ ] Restore on reinstall with the original account restores verified access; another account cannot claim it.
- [ ] Sign-out, sign-in and rapid account switching cannot use a prior account's purchases.
- [ ] Renewal updates expiration through a real webhook; cancellation retains access through expiry.
- [ ] Expiration/refund/revocation removes server access even if the client has stale cached UI.
- [ ] Duplicate and delayed notifications do not overwrite newer state.
- [ ] Sandbox purchases never authorize non-allowlisted accounts; production purchases work without an allowlist.
- [ ] Existing website Plus/Pro/Enterprise users are not asked to buy a second subscription.
- [ ] Terms/privacy accurately disclose RevenueCat purchase identifiers and processing; legal review is separate from this implementation.
- [ ] App Store subscription review information, screenshots and review account are supplied for the new purchase flow.

**Not yet verified:** a real Apple purchase, restoration, renewal webhook, signed iOS archive or upload. Browser/unit tests do not certify those steps.

## Technical verification

Run `bun run test src/lib/__tests__/appleSubscriptionPolicy.test.ts src/lib/__tests__/publicPlanCatalog.test.ts src/components/billing/__tests__/AppleSubscriptionPanel.test.tsx` and the existing strategy/billing regressions. Schema regressions are in `supabase/tests/billing/apple_subscriptions.sql` and are intended for a privileged database test connection, never an app-user connection.

Verified in this implementation: purchase-policy/UI tests and existing website billing/strategy tests passed; a signed-in AAPL strategy preview returned HTTP 200 with visible backtest metrics; the deployed Apple verification returned the account's existing website subscription without claiming an Apple purchase; the public comparison shows backtesting for all paid plans. Preview builds reported clean.

The database rollback regression script could not run because the available SQL test connection cannot assume the privileged service role; its database lifecycle/ownership assertions remain unverified. Native update also stopped because this checkout has no generated `dist` web assets. Run the Mac build/sync steps above before testing the native library.

References: [Apple subscriptions](https://developer.apple.com/app-store/subscriptions/), [RevenueCat API v2](https://www.revenuecat.com/docs/api-v2), [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks), [RevenueCat customer identity](https://www.revenuecat.com/docs/customers/identifying-customers).