# Santa Pop-In release audit — November 24, 2026

**Recommendation: NO-GO for Chrome Web Store submission.** The engineering candidate passes the checks below, but the privacy policy linked from the public listing contains a confirmed P1 disclosure mismatch. No website, store listing, release, or tag was published. The candidate remains on `codex/final-release-audit`; do not merge or push it while this blocker remains.

## Candidate and repository

- Manifest/package version: **1.4.10**. Candidate source is the commit containing this report.
- Repository: `https://github.com/johnemorris/santa-pop-in.git`.
- Checkout: `/Users/mojo/repos/Extensions/santa-walker`; no worktree created.
- Original reviewed baseline: `1a912b8` (v1.4.0).
- Latest Hark baseline: `ab1fd540db05ff0ee6c47b94747d57334aa6cb83` (v1.4.9).
- Preflight began on `main` at `ef2691e`. During the audit, Hark committed and merged its cleanup fixes as `ab1fd54`; those changes were preserved and reviewed. The audit branch includes that commit.
- Freshly fetched `origin/main` and local `main` both remain at `ab1fd54`, with zero divergence. No candidate merge or push was performed.
- All 13 original untracked entries were preserved and excluded from the commit/package. The existing `anti/features` stash remains at `59ea4de4abec09a220eba5325440417bf5324196`.

## Hark changes reviewed

All 13 commits from `1a912b8` through `ab1fd54` were reviewed against the actual source: Chase lights placement, recorded bells/laugh/blower sounds and volume adjustments, crystal snowflakes, sound packaging and credits, tip wording/wrapping, homepage links, the seven-module content-script split, shared `crossScreen()`, and the latest audio-stop/walk cleanup tests. Manifest load order and packaged module dependencies were exercised in Chrome.

## Findings and corrections

| Priority | Finding | Resolution |
|---|---|---|
| P1 — open | The store-linked policy describes only one locally stored on/off setting; the extension now stores multiple preferences, paused hostnames, snooze time and the candy counter in Chrome sync storage. | External release blocker. Update the public policy and review Developer Dashboard disclosures before submission. Website publication was outside the authorized scope. |
| P1 — fixed | A delayed worker approval could start Santa after disable, snooze, focus/fullscreen changes, or a newer summon. | Scheduler generations and checks after the asynchronous reply reject stale starts; one owner schedules the next appearance. |
| P2 — fixed | Simultaneous multi-tab requests could reserve the same appearance or overwrite candy-counter increments. | Worker queues serialize each read/check/write operation within a browser instance. |
| P2 — fixed | Recorded one-shot sounds and pending fades could survive mute/disable; abort helpers retained listeners and mishandled already-aborted signals. | Track playing audio, stop it immediately on shutdown/mute, cancel pending fades, and release abort listeners when waits finish. Preserve normal completion fades and Hark's idempotent-stop behavior. |
| P2 — fixed | An old blower's asynchronous cleanup could clear a replacement blower's state. | Associate cleanup with the owning abort signal; aborted acts do not start new melting work. |
| P2 — fixed | Snow fade timers and decoration references could survive shutdown; fullscreen and background activity were incompletely cleaned up. | Cancel tracked timers/hover work, release decoration references, and stop acts/snow/audio on lifecycle transitions. Invalidated old scripts clean up on the next focus/scheduler event; existing tabs still require reload after an extension update. |
| P2 — fixed | Legacy `blink:false` settings could become Twinkle after upgrade. Chrome's object-default storage reads mask the absent `lightMode`. | Read raw settings, merge in the shared helper, and map the legacy preference to Steady. Verified with a real baseline-to-ZIP upgrade. |
| P2 — fixed | Popup storage failures could be silent; size state was visual only and the frequency slider lacked a label association. | Shared save-error handling, guarded tab queries, associated label, document title/language, named size buttons with `aria-pressed`, and a live status message. |
| P2 — fixed | ZIP metadata depended on source timestamps/modes, and runtime globs could include accidental files. | Sorted explicit runtime file list, normalized timestamps/modes, version consistency check, temporary staging, and cleanup. |

No P0 was found. No confirmed functional P1 remains after these fixes. The disclosure P1 remains open.

## MV3, security and permissions

Permissions are unchanged from v1.4.0 and Hark's v1.4.9:

| Access | Purpose and necessity |
|---|---|
| `storage` | Persist preferences, paused hostnames, snooze expiry and candy count through `storage.sync`; maintain the browser-session appearance timestamp in `storage.session`. |
| `activeTab` | Read the current site's URL after a toolbar action so the popup can offer per-site pause. No permanent `tabs` permission is requested. |
| `alarms` | Restore the badge at snooze expiry, independent of an open popup; startup/install handlers recreate the snooze alarm from the stored timestamp. |
| Content-script matches `<all_urls>` | Automatically show enabled holiday effects on ordinary pages without requiring a click on every page. Scripts use the default isolated world and top frame. Chrome restricts privileged pages; file/incognito access remains subject to browser controls. |
| Web-accessible images/sounds | Allow injected visuals and optional audio to load the bundled assets. No remote code is loaded. |

The manifest remains MV3 with a classic background service worker and default extension CSP. Minimum Chrome 102 is now explicit because `storage.session` requires it. No permissions were broadened. No dynamic code evaluation, remote executable dependencies, analytics, or extension network upload code was found. HTML/SVG markup is generated from internal templates; user-visible strings use text properties. Real visual acts also passed on a host enforcing CSP and Trusted Types.

Normal settings writes occur on user changes, not animation frames. Chrome sync quotas still apply, including the per-item limit on a very large paused-site list. Popup write failures are surfaced. The counter queue prevents lost updates across tabs in one browser; it does not provide a cross-device transaction over Chrome Sync.

The packaged sound credits now link the blower recording's source and CC BY 4.0 license. Audio remains bundled, optional and off by default.

## Verification

- `npm run lint`: passed syntax checks for runtime modules, build code and test files.
- `npm test`: **18 passed**, zero failed. Covers settings/date merging, popup behavior, badge/gating logic, stale approvals, concurrent requests/counters, audio cleanup, already-aborted waits and replacement-blower ownership.
- `npm run test:browser`: **13 passed**, zero failed, in headed **Chrome for Testing 158.0.8127.18**. The final run loaded an unpacked copy of the actual release ZIP.
- Real browser checks: all eight summon acts and decoded images; changing walk/gallop rig transforms; click dance/speech; candy glitter and persisted count; cloud single/multiple clicks; all four palettes and three light modes; tree/snow hover; snow melting; popup settings/size state; all seven OGG files decoded; disable during animation; paused-site gating; shortened snooze expiry and actual ZZZ→ON alarm badge transition; fullscreen cleanup; background-tab and second-window denial; host clicks, keyboard input and scrolling; a 600-card dynamically updating page; navigation/reload; reduced-motion scheduling; strict host CSP/Trusted Types; extension reload and a single reinjected stage.
- A separate real upgrade loaded `1a912b8` in a temporary profile, saved existing settings, overlaid the release ZIP at the same extension path and reloaded it. Stored settings survived, and the legacy Steady preference and selected size rendered correctly.
- Sixty rapid lifecycle cycles left no active actor owner, stage, candy records, blower, or pile. Page-wide JS heap after forced GC changed from 2,380,752 to 2,463,068 bytes; the one-second idle task-duration sample was about 31 ms. This is a short stress sample, not a long-duration leak or battery certification.
- Native toolbar popup inspected separately through Chrome's popup target: 266×600 viewport with scrollable content; size changes persisted. Programmatic `openPopup()` does not grant `activeTab`, so a physical toolbar-click/site-pause check remains manual.
- Browser commands were bounded; the final run had an external 120-second process-group watchdog. No audit browser or test-driver processes remained after verification.

To reproduce browser checks, provide Playwright as a local development tool or through `PLAYWRIGHT_MODULE`, and select an installed browser through `CHROME_EXECUTABLE`. `HEADED=1` enables the headed run; `EXTENSION_PATH` can point at an extracted ZIP. These are test tools, not extension runtime dependencies.

## Release package

- File: `dist/santa-pop-in-1.4.10.zip` — **452,840 bytes**, **31 files**.
- SHA-256: `4060c6b56748ce23ab709acab2e5d05e5b4f8a046dd4ff4b1949b7fc71d2ec05`.
- ZIP integrity passed. Every entry matched the reviewed source bytes. Repeated builds were byte-for-byte identical.
- Contents: manifest; background/settings/popup code and styles; all seven content modules; required icons and artwork/branding; seven OGG files and sound credits. Manifest/package versions match. Icon dimensions are 16/48/128 as declared.
- Excluded: tests, build scripts, administrative artwork, unrelated untracked files, source-control metadata, package/development configuration and nested ZIPs. No secrets were found in the runtime set.
- Use the versioned `dist/` artifact, not the pre-existing ignored root `santa-pop-in.zip`.

## Store gate and remaining checks

The [public listing](https://chromewebstore.google.com/detail/santa-pop-in/gakhblepkjfbehjcmddijolcmhhjdaoh) retrieved during the audit still advertises v1.0.0 and the early peek/walk feature set. Its [linked privacy policy](https://johnemorris.github.io/santa-pop-in-privacy/) is the confirmed disclosure blocker. The [JEM6 homepage privacy section](https://jem6.com/extensions/santa-pop-in#privacy) mentions preferences but also needs clearer treatment of paused hostnames and Chrome Sync.

Before submission, accurately disclose the settings/counter/snooze/paused-hostname inventory, Chrome Sync behavior when enabled, transient session timestamp, current-site access for pause, and user-clicked external links. Review the Developer Dashboard privacy answers and permission justifications against that inventory. Do not claim that only one setting is stored locally. Update listing text/screenshots for the actual feature set and verify that the Dashboard links to the corrected public policy. No replacement policy or website changes were published by this audit.

This gate follows Chrome's requirements for [accurate privacy disclosures](https://developer.chrome.com/docs/webstore/program-policies/policies) and its clarification that [local/Chrome Sync storage still needs disclosure](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq). [Chrome's storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage) describes sync behavior and quotas.

Remaining manual/extended checks: physical toolbar invocation with its real `activeTab` grant and site-pause controls; audible volume/listening on a real output device; a longer multi-tab battery/CPU soak and natural full-duration animation/scheduler observation; optional file/incognito behavior if advertised. A signed Chrome Web Store update and private Developer Dashboard metadata were not accessible or submitted. Browser testing sampled the visual acts and exercised interruptions; it was not an exhaustive certification across every website or Chrome version.

**Release control:** keep the candidate on its feature branch until the P1 policy mismatch is corrected and the submission disclosures are reviewed. Then reassess the gate before merging/pushing or uploading to the store.
