# Incident quality evaluations

Keep resolved, non-sensitive incident expectations in a local JSON file and run:

```bash
npm run evaluate -- evals/cases.json
```

Each case runs the real supervised `investigate` command, requires a successful
typed synthesis artifact, and checks expected identifiers, claim regexes, and a
minimum confidence. Reports are written privately under `data/evaluations`.

Start from `cases.example.json`. Do not commit customer data, secrets, raw logs,
or private ticket text. Prefer stable evidence identifiers and root-cause
patterns that remain meaningful when wording changes.
