# Shared test fixtures (LAIC §11.3)

Created in M0, grown per milestone. These double as the Configuration Studio's
"preview scenarios", so the corpus is reusable product data, not throwaway.

```
fixtures/
  learners/    seeded LearnerDomainProfiles (single-domain, multi-domain)
  knowledge/   small hand-tagged KnowledgeChunk packages
  events/      recorded/synthetic ActivityEvent sequences
  profiles/    CoachProfile + CoachingPolicy presets
  expected/    golden AdaptiveCoachResponse + trace snapshots
```

Every fixture must validate against the contracts in `../contracts/schemas`.
In M0 the only populated folder is `events/` (a valid ActivityEvent sample used
by the CLI harness / ingest demo).
```
