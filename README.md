# FootFive Backend (historical implementation)

> **Legacy repository:** This contains an earlier Node.js/Express/PostgreSQL implementation of FootFive. The current FootFive / Proball Manager application is developed separately in a private repository. **Do not assume this code is the version running in production.**

- [View the current FootFive application](https://jdwd40.com/footfive/)
- [Developer's GitHub profile and project overview](https://github.com/jdwd40)

---

## Earlier backend design

Node.js / Express REST API backed by PostgreSQL. It runs a real-time knockout tournament simulator and exposes JSON and SSE under `/api`.

## Where to read next

- **[LIVING_ARCHITECTURE.md](LIVING_ARCHITECTURE.md)** — Canonical file map and dependency notes (update this when you add or rename source files).
- **[docs/README.md](docs/README.md)** — Index of setup guides, API reference, and feature notes.
- **[AGENTS.md](AGENTS.md)** — How to run the app and tests in environments with pre-set `PG*` variables.

Setup details: [docs/INSTALLATION.md](docs/INSTALLATION.md). API listing: [docs/API_REFERENCE.md](docs/API_REFERENCE.md).
