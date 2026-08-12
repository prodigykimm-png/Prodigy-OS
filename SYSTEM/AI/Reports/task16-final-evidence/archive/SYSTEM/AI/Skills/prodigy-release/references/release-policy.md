# Release Classification

| Category | Typical paths | Default action |
|---|---|---|
| Feature | `SYSTEM/Views/`, `SYSTEM/TEMPLATE/`, `HUB/`, direct tests | Include when requested |
| Operational data | `DAILY/`, `PARA/` | Exclude unless explicitly named |
| Personal config | `.obsidian/workspace*`, plugin `data.json`, `.gjc/` | Exclude |
| Cache/runtime | `SYSTEM/CACHE/`, `.cache/`, generated runtime | Exclude |
| Agent evidence | `.omo/`, generated QA/review transcripts | Exclude |
| Deletion | Any deleted path | Review individually; never infer intent |
| Secret candidate | API key, bearer token, private key | Stop release |

Documentation belongs with the feature only when it describes that feature's public behavior. Tests belong with the implementation they protect.
