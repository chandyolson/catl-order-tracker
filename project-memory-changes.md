# CATL Equipment Manager — Logged Changes (2026-04-01 evening)

## UI/Layout Fixes (Overview Page)

1. **Assign tasks to team members** — @Caleb, @Chandy, @Jen tagging. Notification bar showing who sent an action item. Needs team member system built out.
2. **Build shorthand should NOT be required** — remove the required validation
3. **Timeline documents should be clickable** — if a document is uploaded, show an indicator and make it a link to the Drive file
4. **Google Drive folder refresh** — add a button to re-scan/refresh the Drive folder contents
5. **QuickBooks sync** — verify it's actually working
6. **Call button on dashboard** — click-to-call for customers and manufacturers. AI assistant should also be able to initiate a call.
7. **Discount/freight formatting** — the discount and freight area layout is broken, needs fixing
8. **Reorder the overview card** — contract name + MOLY # at top → manufacturer + base model + "click build" below that → extended length option right under base model (Ranch WB → Extended Length is natural flow)
9. **Spec pills location** — move them up near the blue box or remove if redundant with the build display
10. **Remove all vertical scrolling containers** — task list, timeline, document chain should expand to fit. No scroll bars.
11. **Consistent tan title bar sizing** — Order Details, Timeline, Tasks, Document Chain headers should all be the same size. The content sections can vary.
12. **Document chain items must be clickable** — if a document exists in a slot, clicking it should open the Drive link
13. **Compare tab alignment** — Document A and Document B selectors are vertically offset, fix alignment
14. **Order pipeline segmented colors** — color bars by equipment type/manufacturer
15. **Align cattle assistant header** — line it up with "CATL Resources Equipment Manager" header
16. **Order pipeline colors** — match the app's design system (navy, teal, gold, cream)

## Features to Build

17. **Team assignment system** — assigned_to field on tasks, @mention in chat, notification bar for incoming assignments
18. **Click-to-call integration** — call buttons throughout the app, AI-initiated calls


## Email Automation Pipeline (TO BUILD)

### Phase 1: Auto-capture email attachments
- Monitor Gmail for Moly sales orders (from: orders@molymfg.com, attachment: CATL*.pdf)
- Monitor Gmail for Moly invoices (from: donotreply@molymfg.com, attachment: *_SO_*IN_*.PDF)
- Auto-save PDFs to correct Drive folder based on contract number in email body/subject
- Auto-fill document chain slots
- Auto-compare documents and flag mismatches

### Phase 2: Email task extraction
- Parse equipment-related emails for action items
- Create tasks linked to the correct order (match by contract number)
- General equipment tasks show on dashboard
- Order-specific tasks show in that order's task list

### Phase 3: Notifications
- Alert Tim when documents don't match (comparison failures)
- Alert when paperwork is missing (e.g. order has PO but no bill after X days)
- Alert when Moly invoice arrives (equipment may be shipping)

### Moly Email Patterns (confirmed from Gmail)
- Sales Orders: from orders@molymfg.com, subject "Ranch SILENCER WB Order# CATL0414021626", attachment "CATL/CATL0414021626.pdf", body contains contract number "44274"
- Invoices: from donotreply@molymfg.com, subject "Moly Manufacturing, LLC Invoice4/1/20260044270", attachment "000002480_SO_0044270IN_20260401_000.PDF"
