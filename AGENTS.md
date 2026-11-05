# Architecture rules

- Strategy previews use the shared feature gate for `ai.backtests` and the shared upgrade dialog in StrategyBuilderCard; the server remains authoritative so both Technical Analysis and Strategy Lab handle denied access consistently.
- Public plan descriptions share a presentation-only catalog for pricing cards, FAQs and comparisons; verify monthly AI quotas against the AI resolver and live plan rows, never use marketing facts to authorize access.
- Apple purchases use RevenueCat with authenticated Vela UUID identities; trusted server reconciliation writes separate Apple billing records, and shared feature/AI resolvers combine providers without overwriting Stripe state. Native purchase surfaces never expose website checkout.