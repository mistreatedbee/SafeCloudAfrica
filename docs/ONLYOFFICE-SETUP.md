# ONLYOFFICE Document Editor Setup

Safe Cloud Africa uses ONLYOFFICE Docs for Word and Excel editing in the Document Management module.

## Required Vercel environment variable

Set this on Vercel for the frontend/API project:

```bash
ONLYOFFICE_DOCSERVER_ORIGIN=https://your-onlyoffice-server-url
```

## Other required / recommended server variables

```bash
ONLYOFFICE_JWT_SECRET=your-onlyoffice-jwt-secret
INSFORGE_SERVICE_ROLE_KEY=your-insforge-service-role-key
```

Recommended:

```bash
DMS_FILE_ACCESS_JWT_SECRET=your-app-file-token-secret
APP_PUBLIC_ORIGIN=https://safe-cloud-africa.vercel.app
```

## Editing rules

- Editable: `.doc`, `.docx`, `.xls`, `.xlsx`
- Not editable: `.pdf`

PDF files remain view/download only.

## What happens when ONLYOFFICE is not configured

- The editor page does not crash.
- The user sees a friendly message.
- The user can still use file fallback actions when file access is available.

## Vercel notes

- Add the variables in **Project Settings → Environment Variables**.
- Redeploy after saving the new variables.
- Ensure the ONLYOFFICE server is reachable from the public internet and its JWT secret matches `ONLYOFFICE_JWT_SECRET`.
