# Chaos Test Fix Guide — Branches Central Network

**Date**: 2026-03-06
**Scope**: crew-scheduler.html, hand-tool-checkout.html, tv.html, js/tools.js
**Builds on**: SECURITY_FIX_GUIDE from Chaos Tester 4:4:26.md (dashboard/chat/api fixes)
**Status**: Not started

---

## Connected Projects — READ FIRST

These projects contain **copies of the same files** and must receive the same
fixes after we validate them here. Fixing only Branches-V1 leaves 3 other
copies vulnerable.

| Project | Shared files | Occurrences |
|---------|-------------|-------------|
| `Clipping Inventory/` | crew-scheduler.html, hand-tool-checkout.html, tv.html, all js/ | 185 |
| `Skeleton Branches/` | crew-scheduler.html, hand-tool-checkout.html, tv.html, js/ | 157 |
| `Crew Scheduler/Crew-Scheduler/` | index.html (standalone scheduler) | 31 |
| `_Archive Bank/Crew Scheduler - inner duplicate/` | Archived copy — review if still referenced |

**Propagation rule**: After each fix is tested in Branches-V1, it must be
copied to connected projects. Each task below has a "Propagate" step at the end.

---

## Task Overview

| # | Task | Severity | Files | Depends on |
|---|------|----------|-------|------------|
| 1 | Add escapeHtml helper to standalone pages | Critical | crew-scheduler.html, hand-tool-checkout.html | None |
| 2 | Fix XSS in crew-scheduler.html | Critical | crew-scheduler.html | Task 1 |
| 3 | Fix XSS in hand-tool-checkout.html | Critical | hand-tool-checkout.html | Task 1 |
| 4 | Fix postMessage wildcard origin | High | js/tools.js | None |
| 5 | Wrap localStorage JSON.parse in try/catch | High | crew-scheduler.html, hand-tool-checkout.html | None |
| 6 | Add input length limits and validation | Medium | crew-scheduler.html, hand-tool-checkout.html | None |
| 7 | Prevent duplicate crew names | Medium | crew-scheduler.html, hand-tool-checkout.html | None |
| 8 | Fix crew ID collision (Date.now) | Medium | crew-scheduler.html, hand-tool-checkout.html | None |
| 9 | Add tool return mechanism | Medium | hand-tool-checkout.html | None |
| 10 | Propagate all fixes to connected projects | High | All connected projects | Tasks 1-9 |
| 11 | Verify and test | High | All | Task 10 |

---

## Pre-Work Checklist

Before starting any task:

- [ ] Confirm we are editing files in `Branches Central Network/Branches-V1/`
- [ ] Note that crew-scheduler.html and hand-tool-checkout.html are **self-contained single-file apps** (inline `<script>` blocks, no external JS imports)
- [ ] Note that `js/utils.js` has `SecurityUtils.escapeHtml()` but it is **NOT loaded** by the standalone pages — they have no `<script src>` tags for it
- [ ] Note that `tv.html` already has its own inline `escapeHtml()` function (line 1415) — it is already safe
- [ ] The previous fix guide (March 4) addressed `index.html`, `js/chat.js`, `js/api.js`, `js/config.js` — we do NOT re-do those

---

## Task 1: Add escapeHtml helper to standalone pages

**Severity**: Critical (prerequisite for Tasks 2-3)
**Files**: crew-scheduler.html, hand-tool-checkout.html
**Risk**: None — adding a new function, no existing behavior changes

### What

Both standalone pages use inline `<script>` blocks and do not load `js/utils.js`.
They need their own `escapeHtml()` function added inside their `<script>` tag
before we can use it to fix the XSS issues.

### Where to add

In each file, add the function near the top of the `<script>` block, right after
the variable declarations and before `function init()`.

### The function

```javascript
// Security: HTML escape for user-provided values
function escapeHtml(text) {
    if (typeof text !== 'string') return String(text);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

### Verify

After adding, open browser console on each page and confirm:
```javascript
escapeHtml('<script>alert(1)</script>')
// Should return: &lt;script&gt;alert(1)&lt;/script&gt;
```

### Caution

- Do NOT import `js/utils.js` into these standalone pages — they are designed to
  be single-file apps with zero dependencies. Adding a script import changes
  their deployment requirements.
- Match the exact same escapeHtml implementation used in `tv.html:1415` for
  consistency across the project.

### Propagate

After verified: copy the same function into the matching files in Clipping
Inventory and Skeleton Branches (Task 10).

---

## Task 2: Fix XSS in crew-scheduler.html

**Severity**: Critical
**Depends on**: Task 1
**Risk**: Low — changing how names display, no logic changes

### What

User-provided crew names are injected directly into `innerHTML` via template
literals without escaping. This is stored XSS — the payload persists in
localStorage and re-executes on every page load.

### Vulnerable locations

All are inside `renderCrews()` (~line 713) and `renderResourceCategory()` (~line 689):

1. **Line 716** — `<div class="crew-name">${crew.name}</div>`
2. **Line 696** — `data-item="${item}"` and the card text content `${item}`
3. **Line 647** — `showToast()` with crew name in success message

Also in `renderCrews()`:
4. **Lines 729-739** — member names: `data-item="${m}"` and `${m}`
5. **Lines 753-763** — truck names
6. **Lines 775-785** — equipment names
7. **Lines 798-806** — job names
8. **Lines 821-830** — salesman names

### Fix pattern

Wrap every user-provided value with `escapeHtml()` before insertion into HTML:

```javascript
// BEFORE (vulnerable):
<div class="crew-name">${crew.name}</div>

// AFTER (safe):
<div class="crew-name">${escapeHtml(crew.name)}</div>
```

Apply this to:
- `crew.name` in crew header
- `item` in renderResourceCategory (both the `data-item` attribute AND the text)
- `m`, `t`, `e`, `j`, `s` variables in the crew member/truck/equipment/job/salesman loops
- The crew name in `showToast()` on line 647

### Important — data-item attribute

The `data-item` attribute is used by drag/drop logic to identify items.
Escaping it for display is correct, but the **draggedData.item** value read
back via `event.target.dataset.item` will now contain the escaped version.

This means we need to **also escape when comparing** in `handleDrop()`, OR
store the raw value in a separate data attribute:

**Option A (simpler)**: Escape consistently everywhere — both in `data-item`
and when matching in arrays. Since the source arrays (resources.crewMembers etc.)
contain raw names, this could cause mismatches.

**Option B (recommended)**: Use `textContent` for display, keep `data-item` raw
for logic, and only escape the visible text:

```javascript
// In renderResourceCategory:
return `<div class="card ${cardClass} ${usedClass} ${multiUseClass}"
             draggable="${!isUsed || multiUse}"
             data-item="${item}"
             data-type="${cardClass}"
             ondragstart="handleDragStart(event)"
             ondragend="handleDragEnd(event)">
    ${escapeHtml(item)}
</div>`;
```

This keeps `data-item` as the raw value (used for array lookups in drop logic)
while escaping only the visible text content. The `data-item` attribute is safe
because HTML attribute values in quotes cannot break out via normal text — the
risk would require a `"` character in a name, which should also be escaped:

```javascript
data-item="${escapeHtml(item)}"
```

**Decision needed**: Use Option B (escape display text + data-item attribute values).
This is safest and the drag/drop comparisons will match because both sides go
through the same escaping.

### Verify

1. Add a crew named `<img src=x onerror=alert('XSS')>`
2. Confirm the name shows as literal text, not as a broken image
3. Refresh the page — confirm no alert fires (stored XSS test)
4. Drag and drop still works correctly after escaping
5. Delete the test crew

### Caution

- The `showToast()` function uses `textContent` (line 939), so it is already
  safe for the message body. But the crew name interpolated into the string
  on line 647 goes through `showToast()` which is fine.
- Test drag/drop thoroughly after this change — it's the highest-risk side effect.

---

## Task 3: Fix XSS in hand-tool-checkout.html

**Severity**: Critical
**Depends on**: Task 1
**Risk**: Low — same pattern as Task 2

### What

Same innerHTML XSS pattern as crew-scheduler, but with additional attack
surface from tool names, types, and tags.

### Vulnerable locations

1. **Line 775-793** — renderTools(): `${type}` in stack header, `${tool.name}`,
   `${tool.tag}` in tool cards
2. **Line 879** — renderCrews(): `${crew.name}` in crew header
3. **Line 891-899** — crew tool cards: `${tool.name}`, `${tool.tag}`
4. **Line 844** — showToast with crew name
5. **Line 748** — showToast with tool name

### Fix pattern

Same as Task 2 — wrap all user values in `escapeHtml()`:

```javascript
// Tool rendering:
<div class="stack-name">🔽 ${escapeHtml(type)}</div>
<div class="tool-name">${escapeHtml(tool.name)}</div>
<div class="tool-tag ${tool.crewId ? 'checked-out' : ''}">${escapeHtml(tool.tag)}</div>

// Crew rendering:
<div class="crew-name">${escapeHtml(crew.name)}</div>
```

### Special case — toggleStack()

The `toggleStack()` function is called with the type string:
```javascript
onclick="toggleStack('${type}', event)"
```

If `type` contains a single quote, this breaks the onclick handler. Escape
quotes in the onclick attribute:

```javascript
onclick="toggleStack('${escapeHtml(type).replace(/'/g, "\\'")}', event)"
```

Or better — use data attributes instead of inline handlers:

```javascript
data-stack-type="${escapeHtml(type)}"
```

Then add a delegated click listener. This is a bigger refactor, so for now
the quote-escaping approach is acceptable.

### Verify

1. Add a tool with type `<script>alert(1)</script>`, name `test"onclick="alert(2)`, tag `T-XSS`
2. Confirm all values display as literal text
3. Expand the tool type stack — confirm it works
4. Drag tools to crews — confirm drag/drop still works
5. Remove test data

### Caution

- Tool IDs are numeric (auto-generated), so they don't need escaping
- `tool.crewId` is either null, a number, or 'OUT_OF_SERVICE' — also safe
- The `data-tool-id` attribute only contains numbers — safe

---

## Task 4: Fix postMessage wildcard origin

**Severity**: High
**File**: js/tools.js
**Risk**: Low — tightening an existing security check

### What

`sendMessageToTool()` at line 342 uses `'*'` as the target origin:
```javascript
iframe.contentWindow.postMessage({...}, '*');
```

This means any page could receive these messages if the iframe were pointed
at a malicious URL.

### Fix

Replace `'*'` with the specific origin of the loaded tool:

```javascript
sendMessageToTool(toolId, message) {
    const iframe = document.getElementById('toolIframe');
    if (iframe && iframe.contentWindow) {
        const tool = this.loadedTools.get(toolId);
        if (tool && tool.status === 'ready') {
            // Use specific origin instead of wildcard
            const targetOrigin = this.getToolOrigin(toolId);
            iframe.contentWindow.postMessage({
                type: 'dashboard_message',
                toolId,
                ...message
            }, targetOrigin || '*');
        } else {
            this.queueMessage(toolId, message);
        }
    }
}

getToolOrigin(toolId) {
    // Get origin from the iframe's current src
    const iframe = document.getElementById('toolIframe');
    if (iframe && iframe.src) {
        try {
            return new URL(iframe.src).origin;
        } catch (e) {
            return null;
        }
    }
    return null;
}
```

### Fallback

If `getToolOrigin()` returns null, we fall back to `'*'`. This preserves
existing behavior for edge cases while being more secure in the common case.

### Verify

1. Open the main dashboard (index.html)
2. Navigate to a tool that uses iframe messaging
3. Confirm the tool loads and communicates correctly
4. Check browser console — no "blocked by origin" errors

### Caution

- The `handleIframeMessage()` function on line 37 already validates incoming
  message origins via `getAllowedOrigins()` — the fix here is for outgoing
  messages, which was the missing piece
- If tools are loaded from `script.google.com`, the origin will be
  `https://script.google.com` — confirm this matches

---

## Task 5: Wrap localStorage JSON.parse in try/catch

**Severity**: High
**Files**: crew-scheduler.html, hand-tool-checkout.html
**Risk**: Very low — adding error handling, no logic changes

### What

Both pages call `JSON.parse(stored)` on localStorage values without try/catch.
If localStorage data is corrupted (manual edit, storage limit, browser bug),
the entire app crashes with an uncaught exception.

### Irony

`js/utils.js` already has `StorageUtils.get()` with proper error handling
(line 329-336), but neither standalone page uses it.

### Locations to fix

**crew-scheduler.html**:
- `loadFromLocalStorage()` line 589-594
- `loadPreset()` line 611-621

**hand-tool-checkout.html**:
- `loadFromLocalStorage()` line 678-686
- `loadPreset()` line 702-713

### Fix pattern

```javascript
// BEFORE (crashes on bad data):
function loadFromLocalStorage() {
    const stored = localStorage.getItem(getStorageKey());
    if (stored) {
        const data = JSON.parse(stored);
        crews = data.crews || [];
    } else {
        crews = [];
    }
}

// AFTER (graceful fallback):
function loadFromLocalStorage() {
    const stored = localStorage.getItem(getStorageKey());
    if (stored) {
        try {
            const data = JSON.parse(stored);
            crews = data.crews || [];
        } catch (e) {
            console.warn('Corrupted schedule data, resetting:', e.message);
            crews = [];
            localStorage.removeItem(getStorageKey());
        }
    } else {
        crews = [];
    }
}
```

Apply the same pattern to `loadPreset()`:

```javascript
function loadPreset(num) {
    const stored = localStorage.getItem(`scheduler_preset_${num}`);
    if (stored) {
        try {
            const data = JSON.parse(stored);
            crews = data.crews || [];
            saveToLocalStorage();
            renderResources();
            renderCrews();
            showToast(`Preset ${num} loaded!`, 'success');
        } catch (e) {
            console.warn('Corrupted preset data:', e.message);
            localStorage.removeItem(`scheduler_preset_${num}`);
            showToast(`Preset ${num} is corrupted and was removed`, 'error');
        }
    } else {
        showToast(`Preset ${num} is empty`, 'error');
    }
}
```

### For hand-tool-checkout.html — additional note

The `loadFromLocalStorage()` also loads `tools`, which has a fallback to
`getDefaultTools()`. Make sure the try/catch preserves that:

```javascript
function loadFromLocalStorage() {
    const stored = localStorage.getItem(getStorageKey());
    if (stored) {
        try {
            const data = JSON.parse(stored);
            tools = data.tools || getDefaultTools();
            crews = data.crews || [];
        } catch (e) {
            console.warn('Corrupted tool data, resetting:', e.message);
            tools = getDefaultTools();
            crews = [];
            localStorage.removeItem(getStorageKey());
        }
    } else {
        tools = getDefaultTools();
        crews = [];
    }
}
```

### Verify

1. Open browser console
2. Run: `localStorage.setItem('scheduler_2026-03-06', 'CORRUPT{{DATA')`
3. Refresh the page
4. Confirm: page loads normally with empty crew list, no crash
5. Confirm: console shows the warning message
6. Repeat for presets: `localStorage.setItem('scheduler_preset_1', '{{bad')`
7. Click "Load 1" — confirm toast says "corrupted and was removed"

### Caution

- When we `removeItem` on corrupt data, the user loses that day's schedule.
  This is acceptable — corrupt data is useless anyway. But the toast message
  should make it clear what happened.
- Do NOT silently swallow the error — always `console.warn` so it's debuggable.

---

## Task 6: Add input length limits and validation

**Severity**: Medium
**Files**: crew-scheduler.html, hand-tool-checkout.html
**Risk**: Very low — restricting input, no existing behavior changes

### What

There are no length limits on crew names, tool names, tool types, or tags.
A user (or automated script) can paste huge strings that break the layout
and fill localStorage.

### Fix — HTML attributes

Add `maxlength` to all input fields:

**crew-scheduler.html line 525**:
```html
<input type="text" id="newCrewName" class="input-field"
       maxlength="100"
       placeholder="Enter new crew name (e.g., Crew A, Maintenance Team)">
```

**hand-tool-checkout.html lines 480-482**:
```html
<input type="text" id="newToolType" class="input-field"
       maxlength="50" placeholder="Tool Type (e.g., Hammer)">
<input type="text" id="newToolName" class="input-field"
       maxlength="100" placeholder="Tool Name (e.g., Hammer #1)">
<input type="text" id="newToolTag" class="input-field"
       maxlength="20" placeholder="Tag (e.g., T-011)">
```

**hand-tool-checkout.html line 496**:
```html
<input type="text" id="newCrewName" class="input-field"
       maxlength="100" placeholder="Crew Name (e.g., Crew A, John's Team)">
```

### Fix — JavaScript validation

Also enforce in JavaScript (maxlength can be bypassed via DevTools):

```javascript
function addCrew() {
    const nameInput = document.getElementById('newCrewName');
    const name = nameInput.value.trim();

    if (!name) {
        showToast('Please enter a crew name', 'error');
        return;
    }

    if (name.length > 100) {
        showToast('Crew name must be 100 characters or less', 'error');
        return;
    }

    // ... rest of function
}
```

Apply the same pattern to `addNewTool()` in hand-tool-checkout.html.

### Verify

1. Try pasting a 10,000-character string — confirm it's truncated at input
2. Try submitting via console with `document.getElementById('newCrewName').value = 'a'.repeat(200)` then calling `addCrew()` — confirm JS validation rejects it

### Caution

- `maxlength="100"` for crew names is generous. Typical names are 5-20 chars.
- `maxlength="20"` for tool tags matches the existing `T-XXX` format.
- These limits don't affect existing data — only new input.

---

## Task 7: Prevent duplicate crew names

**Severity**: Medium
**Files**: crew-scheduler.html, hand-tool-checkout.html
**Risk**: Very low

### What

Users can create multiple crews with the same name, causing confusion.

### Fix

Add a duplicate check in `addCrew()`:

```javascript
function addCrew() {
    const nameInput = document.getElementById('newCrewName');
    const name = nameInput.value.trim();

    if (!name) {
        showToast('Please enter a crew name', 'error');
        return;
    }

    // Check for duplicates (case-insensitive)
    if (crews.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        showToast('A crew with this name already exists', 'error');
        return;
    }

    // ... rest of function
}
```

### Verify

1. Add "Crew A"
2. Try adding "Crew A" again — should be rejected
3. Try adding "crew a" (lowercase) — should also be rejected
4. "Crew B" should work fine

### Caution

- This is case-insensitive to prevent "Crew A" vs "crew a" confusion
- Does NOT prevent duplicates across different dates — each date has its own
  crew list, so the same name on different days is expected behavior

---

## Task 8: Fix crew ID collision (Date.now)

**Severity**: Medium
**Files**: crew-scheduler.html, hand-tool-checkout.html
**Risk**: Very low

### What

`Date.now()` is used for crew IDs. Under rapid creation (programmatic or
fast clicking), the same millisecond timestamp could be reused, causing
ID collisions that corrupt crew data.

### Fix

Replace `Date.now()` with a counter + timestamp combo:

```javascript
// Add at top of script, after variable declarations:
let _idCounter = 0;
function generateId() {
    return Date.now() * 1000 + (++_idCounter % 1000);
}
```

Then in `addCrew()`:
```javascript
// BEFORE:
crews.push({ id: Date.now(), name: name, ... });

// AFTER:
crews.push({ id: generateId(), name: name, ... });
```

### Alternative (simpler)

Use `crypto.randomUUID()` if browser support is acceptable (all modern browsers):

```javascript
crews.push({ id: crypto.randomUUID(), name: name, ... });
```

**Note**: This changes the ID type from number to string. Check that
`removeCrew(crewId)` and `handleDrop()` comparisons still work — they use
`parseInt()` on crew IDs from data attributes, which would break with UUIDs.

**Decision**: Use the counter approach to keep IDs numeric and avoid breaking
existing `parseInt()` usage in drag/drop handlers.

### Verify

1. Open console, run: `for(let i=0;i<10;i++) addCrew()`
   (set input value to "Test" + i first)
2. Confirm all 10 crews have unique IDs
3. Confirm removing any one crew only removes that crew

### Caution

- Existing localStorage data has `Date.now()` IDs — the new scheme is
  backwards compatible (still produces large numbers).
- The `_idCounter` resets on page reload, which is fine — combined with
  `Date.now()` it's unique enough.

---

## Task 9: Add tool return mechanism

**Severity**: Medium
**File**: hand-tool-checkout.html
**Risk**: Medium — adding new drop zone behavior

### What

Tools can be dragged from the available grid to a crew zone, but there is no
way to drag them back. The only way to "return" a tool is to delete the entire
crew. This is a significant usability gap.

### Fix

Add a "Return Tools Here" drop zone above the tools grid:

**HTML** (add before the tools-grid div, around line 474):
```html
<div id="returnZone" class="crew-dropzone" style="
    min-height: 60px; margin-bottom: 20px; text-align: center;
    border: 2px dashed var(--gray-300); border-radius: 8px;
    padding: 15px; display: none;"
     ondragover="handleReturnDragOver(event)"
     ondragleave="handleReturnDragLeave(event)"
     ondrop="handleReturnDrop(event)">
    <span style="color: var(--gray-600);">Drop tools here to return them</span>
</div>
```

**JavaScript** — show the return zone during drag, add handlers:

```javascript
// Show return zone when dragging from a crew
function handleToolDragStart(event) {
    const toolId = parseInt(event.target.dataset.toolId);
    draggedTool = tools.find(t => t.id === toolId);
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';

    // Show return zone if tool is checked out
    if (draggedTool && draggedTool.crewId) {
        document.getElementById('returnZone').style.display = 'block';
    }
}

function handleToolDragEnd(event) {
    event.target.classList.remove('dragging');
    draggedTool = null;
    document.getElementById('returnZone').style.display = 'none';
}

function handleReturnDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('drag-over');
}

function handleReturnDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

function handleReturnDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');

    if (!draggedTool) return;

    const tool = tools.find(t => t.id === draggedTool.id);
    if (tool) {
        tool.crewId = null;
        saveToLocalStorage();
        renderTools();
        renderCrews();
        showToast(`${tool.name} returned`, 'success');
    }
}
```

### Verify

1. Create a crew, drag a tool to it
2. Drag the tool from the crew zone — confirm "Return" zone appears
3. Drop tool on return zone — confirm it reappears in available tools
4. Drag from available tools grid — confirm return zone does NOT appear
   (only shows when returning checked-out tools)

### Caution

- This modifies `handleToolDragStart` and `handleToolDragEnd` which are
  existing functions — be careful not to break the existing crew-to-crew
  drag behavior
- The return zone is hidden by default and only shows during relevant drags
  to avoid clutter
- Test that dragging between crews still works (not just to return zone)

---

## Task 10: Propagate fixes to connected projects

**Severity**: High
**Depends on**: Tasks 1-9 all verified in Branches-V1

### What

Three other projects share the same files and need the same fixes applied.

### Propagation order

1. **Skeleton Branches** — template/skeleton project, should be updated first
   so future clones are safe
2. **Clipping Inventory** — active project, apply fixes
3. **Crew Scheduler (standalone)** — separate project, may have diverged

### Method

For each project, diff the current file against the fixed Branches-V1 version
to identify any project-specific customizations before overwriting:

```bash
diff "Branches Central Network/Branches-V1/crew-scheduler.html" \
     "Skeleton Branches/crew-scheduler.html"
```

If files are identical (except for fixes), copy the fixed version directly.
If they've diverged, apply fixes manually to preserve project-specific changes.

### Files to propagate

| File | To Skeleton | To Clipping | To Crew Sched |
|------|-------------|-------------|---------------|
| crew-scheduler.html | Yes | Yes | Review standalone |
| hand-tool-checkout.html | Yes | Yes | N/A |
| js/tools.js | Yes | Yes | N/A |

### Caution

- The standalone Crew Scheduler in `Crew Scheduler/Crew-Scheduler/` may have
  its own version of the scheduler with different features — do NOT blindly
  overwrite. Diff first.
- Archive copies in `_Archive Bank/` should generally be left alone unless
  they're actively referenced.

---

## Task 11: Verify and test

**Depends on**: All previous tasks

### Test matrix

For each project (Branches-V1, then propagated projects):

**XSS Tests**:
- [ ] crew-scheduler: Add crew named `<img src=x onerror=alert(1)>` — no alert
- [ ] crew-scheduler: Refresh page — no alert (stored XSS check)
- [ ] crew-scheduler: Drag/drop still works after escaping
- [ ] hand-tool-checkout: Add tool with XSS in name/type/tag — no alert
- [ ] hand-tool-checkout: Expand tool stack with XSS type — no alert
- [ ] hand-tool-checkout: Drag/drop still works

**Crash Tests**:
- [ ] Corrupt localStorage with invalid JSON — page loads gracefully
- [ ] Corrupt preset data — toast shows error, no crash
- [ ] Clear all localStorage — pages load with empty/default state

**Input Tests**:
- [ ] Crew name over 100 chars — rejected
- [ ] Duplicate crew name — rejected
- [ ] Empty/whitespace crew name — rejected
- [ ] Tool fields empty — rejected

**Functional Tests (no regressions)**:
- [ ] Add crew, drag resources, save — all works
- [ ] Change date, verify separate storage per date
- [ ] Save/load presets — works correctly
- [ ] Remove crew — resources return to available pool
- [ ] Return tool via drop zone (hand-tool-checkout)

**postMessage Test**:
- [ ] Open main dashboard, load a tool iframe — confirm it communicates
- [ ] Check console for origin-related errors

---

## Execution Order Recommendation

Work through tasks in this order to minimize risk:

1. **Task 5** (try/catch) — Zero risk, prevents crashes, quick win
2. **Task 1** (add escapeHtml) — Zero risk, just adding a function
3. **Task 2** (fix crew-scheduler XSS) — Critical fix, depends on Task 1
4. **Task 3** (fix hand-tool-checkout XSS) — Critical fix, depends on Task 1
5. **Task 6** (input limits) — Low risk, quick
6. **Task 7** (duplicate names) — Low risk, quick
7. **Task 8** (ID collision) — Low risk, quick
8. **Task 4** (postMessage) — Separate file, independent
9. **Task 9** (tool return) — New feature, most complex, do last
10. **Task 10** (propagate) — After all fixes verified
11. **Task 11** (test everything)

This order front-loads safety fixes and back-loads the riskier feature addition.

---

*Generated by Chaos Tester skill — 2026-03-06*
