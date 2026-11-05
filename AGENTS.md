# Architecture rules

- Strategy previews use the shared feature gate for `ai.backtests` and the shared upgrade dialog in StrategyBuilderCard; the server remains authoritative so both Technical Analysis and Strategy Lab handle denied access consistently.
- Public plan descriptions share a presentation-only catalog for pricing cards, FAQs and comparisons; verify monthly AI quotas against the AI resolver and live plan rows, never use marketing facts to authorize access.