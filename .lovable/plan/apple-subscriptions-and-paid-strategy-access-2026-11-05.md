# Apple subscriptions and paid strategy access

## What you will get

- Plus, Pro and Enterprise subscribers can use the full Strategy Lab, strategy builder, strategy previews and backtesting tools, including advanced backtests, trading costs and event tests. Explorer stays gated.
- An iPhone subscription screen with Apple purchase confirmation, monthly/yearly selection, Restore purchases and Manage subscription.
- Existing website subscriptions continue to work with the same Vela account. Website checkout remains separate from Apple billing and is not linked from the iPhone purchase screen.
- Cancellation keeps paid access until the paid period ends. Upgrades take effect immediately and downgrades at renewal where Apple's subscription-group rules permit; Apple's confirmed transaction determines access.

## Plans and pricing

- Offer **Vela Pro** inside the iPhone app: **€29 monthly or €288 yearly** as the requested base prices. Display Apple's actual localized price and billing period, not a hardcoded euro price.
- Keep Plus and Enterprise website prices and unrelated feature allowances unchanged. Both also gain the requested strategy/backtesting access.
- Apple Pro receives the current Pro feature set and its existing monthly AI allowance, not unlimited AI.
- Do not claim that Vela qualifies for Apple's reader-app exception. Use Apple's in-app subscription system for native purchases and allow existing subscribers to sign in.
- Avoid offering a second subscription when an account already has sufficient paid access; subscription management stays with the original payment provider.

## Implementation

### Native purchases

Use RevenueCat's maintained Capacitor 8-compatible purchase library to handle Apple's subscription transactions and restoration rather than implementing receipt verification from scratch. RevenueCat is an additional external service and may charge fees under its current pricing; Apple also charges its applicable commission.

Connect purchases to the signed-in Vela account. Handle cancellation of the purchase dialog, pending approval, unavailable products, failed verification, account switching and restoration without falsely reporting an unlocked plan. Add privacy and terms links plus auto-renewal disclosures.

Replace the current native “managed outside the app” purchase restriction with the Apple purchase screen in upgrade dialogs and Plans & Billing. Continue hiding Stripe checkout and website purchase links in native builds. Android purchase support is outside this change and remains restricted.

### Verified access

- Store Apple subscriptions separately from Stripe subscriptions, with user, approved product, plan, store environment, expiry, renewal state and verification timestamps.
- Validate purchases through RevenueCat on the server; never authorize from the client's purchase result, a supplied plan name or an arbitrary customer ID.
- Process authenticated RevenueCat notifications idempotently and reconcile current provider state for renewals, cancellation, expiry, refunds and revocation. Protect against delayed events overwriting newer state and purchases being attached to multiple Vela accounts.
- Keep Apple test purchases separate from production access. The server decides the allowed environment; a client cannot choose test mode to unlock live tools.
- Update the shared server feature checks and client entitlement snapshot together. Valid subscriptions from either provider grant their features; the displayed plan uses deterministic highest-plan precedence.
- Include Apple Pro in the existing AI access and quota resolver so its AI allowance works even when temporary beta access is disabled. Preserve AI opt-out and own-provider behavior.
- Refresh all mounted feature gates after a verified purchase or restoration. Expired and revoked subscriptions must not retain server access.

### Consistent plan descriptions

Update the shared public plan catalog, homepage, FAQ, comparison and relevant upgrade copy to show strategy/backtesting on all paid plans. Preserve existing unrelated plan limits and pricing.

## Verification

- Add and run concrete regression tests for Plus/Pro/Enterprise access, Explorer denial, Apple Pro product mapping, cancellation through expiry, refund/revocation, duplicate notifications, account ownership and test/live separation.
- Test the purchase-screen states and existing website billing behavior without charging a real payment.
- Check signed-in strategy preview and backtesting access end to end where available, and inspect the current application error reports.
- Run a real Apple sandbox purchase, restoration and renewal/cancellation test on an iPhone or simulator after the Apple and RevenueCat setup is supplied. Browser mocks do not count as Apple purchase verification.

## External setup and release limits

You must create the Pro monthly and yearly auto-renewable products in App Store Connect, complete Apple's paid-app agreements/tax/banking requirements, and connect that app and its products to RevenueCat. Use one subscription group with the appropriate service levels; configure receipt credentials, server notifications and a restrictive purchase-transfer policy.

I will provide a setup checklist and request private credentials through secure connection/secret forms, never chat or source code. The iOS public SDK key and product identifiers must come from that configuration; missing configuration leaves purchases unavailable rather than simulating success.

A signed iOS archive, TestFlight upload and genuine Apple purchase test still require your Mac with Xcode and your Apple developer account. This environment cannot build or upload a signed `.ipa`. The implementation will distinguish completed work from these external release blockers.

## Technical notes

- Native purchase library: `@revenuecat/purchases-capacitor` compatible with Capacitor 8.
- Native products: proposed stable IDs `vela_pro_monthly` and `vela_pro_yearly`; map only configured, approved App Store products to the Pro plan.
- Separate Apple subscription records are read-only to their owner; only trusted server functions can write billing state.
- Shared authorization remains feature-key based: `ai.backtests`, `strategy.proposal_builder`, `strategy.lab`, `backtest.costs`, `backtest.advanced` and `backtest.events` are included on Plus, Pro and Enterprise.
- Keep Stripe records and its payment handlers isolated. Record provider-aware entitlement resolution in the architecture rules.