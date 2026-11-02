# Architecture rules

- Strategy previews use the shared feature gate for `ai.backtests` and the shared upgrade dialog in StrategyBuilderCard; the server remains authoritative so both Technical Analysis and Strategy Lab handle denied access consistently.