---
name: chaos-tester
description: Adversarial QA testing from the customer perspective. Use when asked to test, break, crash, stress-test, find bugs, QA, or validate any website, web app, API, form, or program. Systematically attempts to cause failures through malformed inputs, edge cases, boundary violations, race conditions, and unexpected user behaviors. Generates comprehensive bug reports with reproduction steps.
---

# Chaos Tester

Systematically attempt to break applications by thinking like a malicious or confused customer.

## Core Philosophy

**Goal**: Find every way the application can fail before real users do.

**Mindset**: Assume nothing works correctly. Every input field is a potential crash. Every button click sequence could cause data corruption. Every assumption the developer made is wrong.

## Testing Workflow

1. **Reconnaissance** - Map the attack surface
2. **Input Chaos** - Assault every input with edge cases
3. **Flow Breaking** - Disrupt expected user journeys
4. **State Corruption** - Manipulate application state
5. **Stress & Race** - Overwhelm and desync
6. **Report Generation** - Document all failures

## Step 1: Reconnaissance

Before attacking, map targets:
```
- All input fields (text, number, date, file, etc.)
- All buttons and clickable elements
- All forms and submission endpoints
- URL parameters and routes
- Local storage / session data access points
- API endpoints if visible
- Hidden fields and disabled elements
```

## Step 2: Input Chaos Attacks

For EVERY input field, test these categories. See `references/attack_patterns.md` for full payload lists.

### Boundary Attacks
```
Empty: ""
Single char: "a"
Over max length: "a" x (maxlength + 1)
Massive: "a" x 10000
Negative: -1, -999999
Zero: 0
Decimals: 1.5, 0.0001
INT overflow: 2147483648, -2147483649
```

### Type Confusion
```
String->number: "abc", "12abc"
Falsy strings: "null", "undefined", "NaN", "false"
Array/Object: [], {}, [1,2,3]
```

### Injection Probes
```
SQL: ' OR '1'='1, '; DROP TABLE--
XSS: <script>alert(1)</script>
Template: ${7*7}, {{7*7}}
Path: ../../../etc/passwd
```

### Unicode Chaos
```
Emoji: (emoji sequences)
RTL: reversed text markers
Zero-width: invisible joiners
Combining: diacritical stacking
Homoglyphs: Cyrillic lookalikes
```

## Step 3: Flow Breaking

### Navigation Chaos

- Back button during form submit
- Refresh during data load
- Deep link to middle of wizard
- Browser back after logout

### Multi-Tab Attacks

- Same form in 2 tabs, submit both
- Login tab1, logout tab2, act tab1
- Edit same record in parallel

### Timing Attacks

- Double/triple click submit
- Click during page load
- Submit then navigate away
- Rapid repeated actions

## Step 4: State Corruption

### Storage Attacks

- Clear localStorage mid-session
- Set storage to invalid JSON
- Delete specific cookies
- Corrupt session values

### URL Manipulation

- Change IDs: ?id=999999, ?id=-1, ?id=null
- Missing required params
- Array params: ?id[]=1&id[]=2

### Form Tampering (via DevTools)

- Remove required attributes
- Enable disabled fields
- Change hidden values
- Modify select options

## Step 5: Stress & Race

### Volume

- Submit form 100x rapidly
- Upload huge files
- Paste 1MB text
- 50 parallel requests

### Race Conditions

- Two purchases of last item
- Rapid like/unlike
- Parallel balance transfers

## Report Template
```markdown
## Bug: [Title]

**Severity**: Critical / High / Medium / Low
**Type**: Crash / Data Loss / UI Break / Security / Logic Error

### Steps
1. [Step]
2. [Step]

### Input
[Exact payload]

### Expected
[What should happen]

### Actual
[What happened]

### Evidence
[Console error / screenshot / response]
```

## Priority Order

1. Payment/financial forms
2. Authentication flows
3. Data modification
4. User input displays
5. File uploads
6. Search/filters
7. Navigation

## Scripts

Run `scripts/chaos_inputs.py` to generate test payloads for any input type.
