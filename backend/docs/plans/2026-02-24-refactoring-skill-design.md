# Refactoring Skill Design

## Summary

A personal Claude Code skill (`~/.claude/skills/refactoring/`) that provides a disciplined refactoring pipeline for TypeScript/NestJS projects. Triggers both on explicit user request and proactively when code smells are detected.

## Requirements

- **Scope:** General refactoring covering structural, performance, and readability improvements
- **Trigger:** Explicit user request + proactive code smell detection
- **Methodology:** Hybrid — analysis-first planning, then test-first implementation
- **Technology:** TypeScript/NestJS focused examples
- **Token budget:** SKILL.md ~400-500 words, catalog in separate file

## Architecture

### Files

```
~/.claude/skills/refactoring/
  SKILL.md                 # Main skill (~400-500 words)
  refactoring-catalog.md   # Detailed before/after examples (~300 lines)
```

### Pipeline (6 stages)

```
Detect → Analyze → Plan → Test → Refactor → Verify
```

1. **Detect** — Identify code smells via checklist (god class, long method, duplication, coupling, dead code, primitive obsession, feature envy, excessive nesting)
2. **Analyze** — Classify severity (High/Medium/Low), map dependencies, assess blast radius
3. **Plan** — Create refactoring plan, get user approval before proceeding
4. **Test** — Lock current behavior with tests (references superpowers:test-driven-development)
5. **Refactor** — Apply changes in small incremental steps, tests must pass after each step
6. **Verify** — Final verification (references superpowers:verification-before-completion)

### SKILL.md Sections

1. Overview — Core principle: "Improve structure without changing behavior"
2. When to Use — Symptoms list + proactive detection flowchart
3. Pipeline — 6-step process with flowchart
4. Code Smell Quick Reference — Table: smell → technique → severity
5. Red Flags — What NOT to do during refactoring
6. Common Mistakes — Table of frequent errors

### refactoring-catalog.md Sections

Detailed TypeScript/NestJS before/after examples for each code smell:
- God class → Extract service/module
- Long method → Extract method, compose functions
- Feature envy → Move method to correct class
- Shotgun surgery → Consolidate related changes
- Tight coupling → Dependency injection, interfaces
- Dead code → Safe removal with coverage analysis
- Primitive obsession → Value objects, enums
- Excessive nesting → Early return, guard clauses

### Skill Integrations

- `superpowers:test-driven-development` — Referenced in Test stage
- `superpowers:verification-before-completion` — Referenced in Verify stage
- `superpowers:brainstorming` — Referenced for large-scale refactoring planning

### Trigger Conditions

Explicit:
- User says "refactor", "refaktör", "temizle", "iyileştir", "düzenle"

Proactive:
- Functions exceeding 100 lines
- Duplicated code blocks detected
- Service with 5+ dependencies
- Files exceeding 500 lines
- Complex conditionals (3+ nested levels)

## Implementation Plan

Follow writing-skills TDD process:
1. RED — Run baseline pressure scenarios without skill
2. GREEN — Write minimal SKILL.md addressing baseline failures
3. REFACTOR — Close rationalization loopholes, add catalog

## Approval

- [x] Design approved by user (2026-02-24)
