# Solidity Post-Processing Design

## Problem

GPT-5.2 sometimes writes Solidity code as plain text instead of calling the `generateContract` tool. When this happens, the backend never compiles the code, never extracts constructor args, and the PendingDeployCard never appears in the frontend.

## Solution

Add deterministic post-processing in `handleChat()` after the tool loop. If the AI response contains Solidity code in a markdown block but `generateContract` was never called, automatically extract the code, compile it, extract constructor args from the ABI, cache it, and populate `pendingDeploys`.

## Key Design Decisions

- **Backend only** — zero frontend changes needed
- **Safety net pattern** — does nothing when the tool IS called correctly
- **Fail-safe** — if compilation fails, log warning but don't crash; user still sees code in message
- **No extra API calls** — uses existing solc compilation, no additional OpenAI requests
