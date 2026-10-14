> **Current entry point:** Read [docs/backend-poc.md](docs/backend-poc.md) and CLAUDE.md. The skeleton-only prompt below is historical and has been superseded by the owner's request to implement the PoC backend.

# How to start Claude Code on this project

1. Install the prerequisites if you don't have them: Git, Python 3.12, Node.js 20+, Docker Desktop, and Microsoft ODBC Driver 18 for SQL Server.
2. Open a terminal in this folder (`C:\Users\lenovo\Downloads\new work`) and run `claude`.
3. Paste the prompt below as your first message.

---

Read CLAUDE.md, then docs/permissions.md, docs/business-rules.md and docs/skeleton-plan.md.

We are building the skeleton only. Follow docs/skeleton-plan.md phase by phase, starting with Phase 0. Before you write any code, give me a short plan for Phase 0: the files you'll create, the dependencies you'll add with their licences, and anything in the docs you think is unclear or wrong. Wait for my OK.

After each phase: run the checks the plan lists, commit, then stop and tell me what you built, how to run it, and any decisions you made. Do not start the next phase until I say so.

Remember: permissions are checked by permission code only, never by role or template name. Module business logic stays as stubs unless I ask for it.
