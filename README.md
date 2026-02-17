# Safe Cloud Africa (IDSMP)

Integrated Digital Safety Management Programme (IDSMP) aligned to ISO 45001, ISO 9001, and ISO 14001.

## Local development

1. Install dependencies:
   - `npm install`
2. Start the dev server:
   - `npm run dev`
3. Build for production:
   - `npm run build`

## How to test PPE module end-to-end

### PPE Issue Tracker

1. Sign in as an Admin, Manager, Supervisor, Consultant, or Employee.
2. Go to **PPE Management** in the sidebar.
3. On the header, click **Report PPE issue** to open the PPE Issue Tracker create form.
4. Capture at least: PPE type, issue category, risk level, description, and (optionally) site/department and person.
5. Submit the form – the issue appears under the **Issue Tracker** tab. For **High/Critical** risk, in‑app notifications are sent via the escalation chain.
6. Open an issue row to see the full detail view:
   - Add progress notes to the **Progress log**.
   - Open **Manage evidence** to upload photos/files linked to the issue.
   - Use **Manager sign-off**, **Safety officer verify**, and **Auditor confirm** (if required) to complete workflow.
7. Try to close an issue before manager sign‑off or required auditor confirmation – closure should be blocked. Once sign‑offs are captured, use **Close issue** to complete it. The system auto-sets `closure_date` and enforces evidence rules.

### PPE Inventory & Stock

1. From **PPE Management**, click **Add PPE item** to create at least one PPE master item.
2. Click **Add Stock** to create PPE stock for a site/department, including on‑hand quantity and reorder levels.
3. Switch to **Inventory & Reorders** tab:
   - Confirm stock is listed with **Status** badges (OK / Low / Out of stock).
   - Click **View** on a row to open the stock detail modal.
4. In the stock detail modal:
   - Use **Record stock movement** to log `In`, `Out`, `Return`, and `Adjust` movements and confirm the movement history table updates balances.
   - Observe **On hand**, **Reserved**, and **Available** summary cards.
   - Reduce stock below the reorder level: this should trigger a high‑severity in‑app notification and auto‑create a **PPE reorder request**. The reorder request appears in the **Reorder history** section and contributes to the open reorder count in the inventory tab header.

### Integration between Issue Tracker and Inventory

1. When capturing a PPE issue where **PPE issued / replaced** is ticked, ensure a replacement is logged in inventory by:
   - Linking the issue to a stock item (if implemented for your workflow), or
   - Manually recording an `Out` movement in the relevant stock record and referencing the PPE issue ID.
2. Create an **Insufficient Supply** PPE issue and then open the **Inventory & Reorders** tab to review stock levels for the relevant PPE type – use this to justify reorder requests.

### Auto-create PPE Issues from Inspections

1. Run an **Inspection** using a checklist where certain questions relate to PPE (e.g., “PPE worn correctly”, “Hard hat in good condition”).
2. During completion of the inspection run, set relevant PPE questions to **NC** (non‑compliant).
3. Complete the inspection run:
   - The system auto‑creates NCRs and CAPAs as per the inspections module.
   - For PPE‑related NC items, it also auto‑creates PPE Issue Tracker records, pre‑linked to the inspection run and checklist items.
4. Navigate back to **PPE Management → Issue Tracker** and verify that PPE issues have been auto‑created from the inspection, with correct PPE type/category, risk level, and checklist references.

### Demo data (optional)

To seed demo companies, users, and some baseline incidents/tasks:

1. Ensure `docs/phase2-schema.sql` has been applied to your InsForge database.
2. Set the following environment variables in your shell:
   - `INSFORGE_BASE_URL`
   - `INSFORGE_ANON_KEY`
3. Run:
   - `node scripts/seed-demo.mjs`

You can then log in with the demo accounts listed in `docs/test-accounts.md` and use them to exercise the PPE module with realistic tenant and role data.

## How to run audits end-to-end

The Audits module supports the full digital audit lifecycle. Use these steps to run an audit from creation to closure.

1. **Create an audit** (Admin or Consultant)
   - Go to **Audits** in the sidebar, then click **Schedule Audit**.
   - Fill in: title, objectives, criteria, scope, **at least 3 proposed dates**, optional checklist template, required document list, document submission deadline, auditors, auditees (department reps), and company representatives.
   - Click **Create audit**. The audit is created in **Draft** with **Awaiting date approval**.

2. **Date approval** (Auditee)
   - Open the audit from the list. If you are in the auditee list, you will see **Audit date approval**.
   - Choose one of the 3 proposed dates and click **Approve date**, or enter a reason and click **Decline**.
   - On approval, the audit moves to **Scheduled** / **Awaiting Documents**.

3. **Pre-audit document submission** (Auditee)
   - In the same audit, open the **Pre-Audit Documents** section.
   - For each required document, click **Upload** and select a file. When all are uploaded, click **Submit for audit**.
   - An Admin/Consultant/Auditor can then click **Approve for audit** to move the audit to **Ready for Audit**.

4. **Execute the audit** (Auditor)
   - Open the audit and click **Start audit** (status becomes **In Progress**).
   - In **Checklist & responses**, for each question: set Compliant (Yes/No), Finding type (Observation/Finding/Non-conformance/OFI), Allocated/Achieved score, Finding text, Risk, and **Add evidence** (upload files per question).
   - When done, click **Complete audit**. Status becomes **Report Pending**.

5. **Corrective actions** (from findings)
   - Use **Raise finding** on a checklist row to create a program audit finding.
   - Auditee (or responsible person) addresses the finding; **Manager** signs off via **Sign off** on the finding.
   - **Auditor** (or Admin/Consultant) then clicks **Verify & close** to close the finding.
   - When all findings are closed, the audit can move to **Completed**.

6. **Report and closure**
   - Click **Generate report** to create a structured audit report. Use **View report** (printable HTML) or **Export JSON**.
   - For **Completed** audits, **Archive audit** is available to move the audit to **Archived**.

**Roles:** Only Admin/Consultant can create audits. Auditees (users in the audit’s auditee list) approve dates and upload pre-audit docs. Auditors (assigned to the audit) run the checklist and verify findings. Department Managers sign off corrective action closure.

## Project notes

- Frontend: React + Vite + TypeScript + Tailwind
- Current phase: MVP foundation with mock/sample data (Phase 2/3 add real-time integration, automation, and production hardening)
