# Full Smoke Test Design

**Goal:** Test all main flows (auth, chat, marketplace, projects) with seed user via curl + frontend build. Fix any broken backend endpoints.

**Approach:** Sequential curl calls against each endpoint with JWT auth, verify responses, fix failures immediately. Frontend build as final validation.

**Test user:** `seed@chaincraft.dev` / `password123`

## Test Matrix

| # | Flow | Method | Endpoint | Expected |
|---|------|--------|----------|----------|
| 1 | Login | POST | `/auth/login` | JWT token + user info |
| 2 | User profile | GET | `/auth/user` | Seed user details |
| 3 | Balance | GET | `/auth/balance` | ETH balance string |
| 4 | Projects list | GET | `/projects` | Array (empty or populated) |
| 5 | Create project | POST | `/projects` | New project object |
| 6 | Tokens list | GET | `/tokens` | Seed tokens array |
| 7 | Chat | POST | `/assistants/chat` | AI response + responseId |
| 8 | Chat chain | POST | `/assistants/chat` | Context-aware response |
| 9 | Marketplace list | GET | `/marketplace` | Seed templates |
| 10 | Marketplace search | GET | `/marketplace/search?q=erc20` | Search results |
| 11 | Marketplace detail | GET | `/marketplace/:id` | Template detail |
| 12 | Frontend build | - | `next build` | Successful build |

## Fix Strategy

For each failing endpoint: read the relevant service/controller, identify root cause, fix, rebuild, re-test.
