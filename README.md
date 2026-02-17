# Safe Cloud Africa (IDSMP)

Integrated Digital Safety Management Programme (IDSMP) aligned to ISO 45001, ISO 9001, and ISO 14001.

## Local development

1. Install dependencies:
   - `npm install`
2. Start the dev server:
   - `npm run dev`
3. Build for production:
   - `npm run build`

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
