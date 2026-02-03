# SafeCloud Africa Phase 2 - API Integration Guide

## Overview
This guide provides step-by-step instructions for integrating Phase 2 features with InsForge backend services.

## 1. Email Service Setup (InsForge Edge Function)

### 1.1 Create Edge Function for Email Sending

Create a new file in your InsForge backend at: `functions/api/send-email.ts`

```typescript
import { Router } from 'itty-router';

interface EmailRequest {
  to: string;
  subject: string;
  htmlBody: string;
  cc?: string[];
  bcc?: string[];
}

const router = Router();

router.post('/api/send-email', async (request: Request) => {
  try {
    const body: EmailRequest = await request.json();

    // Validate required fields
    if (!body.to || !body.subject || !body.htmlBody) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields: to, subject, htmlBody' 
      }), { status: 400 });
    }

    // TODO: Configure your email provider (SendGrid, Mailgun, AWS SES, etc.)
    // Example with SendGrid:
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: body.to }],
          cc: body.cc?.map(email => ({ email })),
          bcc: body.bcc?.map(email => ({ email })),
        }],
        from: {
          email: process.env.EMAIL_FROM || 'noreply@safecloudafrica.com',
          name: 'SafeCloud Africa',
        },
        subject: body.subject,
        content: [{
          type: 'text/html',
          value: body.htmlBody,
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Email service returned ${response.status}`);
    }

    return new Response(JSON.stringify({ success: true }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Email send error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), { status: 500 });
  }
});

export default router;
```

### 1.2 Configure Environment Variables

Set these in your InsForge environment variables:

```
SENDGRID_API_KEY=sg_xxxxxxxxxxxx
EMAIL_FROM=noreply@safecloudafrica.com
EMAIL_FROM_NAME=SafeCloud Africa
```

### 1.3 Update emailService.ts Configuration

The email service is already configured to call `/api/send-email`. Ensure the API endpoint URL matches your deployment:

```typescript
// In src/api/services/emailService.ts
const API_ENDPOINT = process.env.REACT_APP_API_URL || 'http://localhost:3000';

async function sendEmail(options: SendEmailOptions) {
  const response = await fetch(`${API_ENDPOINT}/api/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  // ... error handling
}
```

## 2. Real-Time Subscriptions Setup

### 2.1 Enable InsForge Real-Time Features

In your InsForge project settings:

1. Enable the "Real-Time Updates" feature
2. Configure the WebSocket endpoint (should be automatic)
3. Set up row-level security (RLS) policies (already done in phase2-schema.sql)

### 2.2 Test Subscription Connection

```typescript
// In src/api/services/realtimeService.ts
// The subscriptions are already configured for these tables:
- incidents
- tasks
- approvals
- form_submissions
- documents

// Test connection:
const unsubscribe = await subscribeToCompanyUpdates(companyId, {
  onIncident: (event) => console.log('Incident update:', event),
  onTask: (event) => console.log('Task update:', event),
});
```

## 3. Storage Buckets Setup

### 3.1 Create Storage Buckets in InsForge

In your InsForge console, create these storage buckets:

1. **documents** - Uploaded document files
2. **form_templates** - PDF form templates
3. **company_logos** - Company logo images
4. **incident_evidence** - Incident evidence files
5. **training_certificates** - Training certificate PDFs
6. **medical_certificates** - Medical certificate files

### 3.2 Configure Bucket Policies

Set these policies for each bucket:

```json
{
  "documents": {
    "public": false,
    "versioning": true,
    "lifecycle": "retain"
  },
  "form_templates": {
    "public": false,
    "versioning": true,
    "lifecycle": "retain"
  },
  "company_logos": {
    "public": true,
    "versioning": false,
    "lifecycle": "retain"
  },
  "incident_evidence": {
    "public": false,
    "versioning": true,
    "lifecycle": "retain"
  },
  "training_certificates": {
    "public": false,
    "versioning": true,
    "lifecycle": "retain"
  },
  "medical_certificates": {
    "public": false,
    "versioning": true,
    "lifecycle": "retain"
  }
}
```

## 4. Security Policies Database Setup

The security settings are stored in `company.metadata.security`. To initialize:

```sql
-- Initialize security metadata for a company
UPDATE companies 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'),
  '{security}',
  '{
    "password_min_length": 8,
    "password_require_uppercase": true,
    "password_require_numbers": true,
    "password_require_special": true,
    "mfa_required": false,
    "session_timeout_minutes": 480,
    "concurrent_sessions_limit": 0
  }'::jsonb
)
WHERE id = $1;
```

## 5. Database Schema Deployment

Run this SQL against your InsForge Postgres database:

```sql
-- Create form_submissions table
CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
  submitted_by_id UUID NOT NULL REFERENCES auth.users(id),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  data JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'submitted',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- Enable RLS
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view submissions in their company"
  ON form_submissions
  FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM memberships 
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create submissions in their company"
  ON form_submissions
  FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM memberships 
    WHERE user_id = auth.uid()
  ));

-- Create indexes
CREATE INDEX idx_form_submissions_company_id ON form_submissions(company_id);
CREATE INDEX idx_form_submissions_template_id ON form_submissions(template_id);
CREATE INDEX idx_form_submissions_submitted_by ON form_submissions(submitted_by_id);
CREATE INDEX idx_form_submissions_created_at ON form_submissions(created_at);
```

## 6. Testing the Integration

### 6.1 Test Email Service

```typescript
// In your browser console or a test page:
import { emailService } from './src/api/services/emailService';

await emailService.sendTemplatedEmail('user@example.com', 'overdue_task', {
  taskTitle: 'Complete Safety Audit',
  taskId: '123',
  dueDate: '2024-01-01',
});
```

### 6.2 Test Storage Upload

```typescript
import { storageService } from './src/api/services/storageService';

const file = new File(['content'], 'document.pdf');
const result = await storageService.uploadFile('documents', file);
console.log('Public URL:', result.publicUrl);
```

### 6.3 Test Form Submission

```typescript
import { formsService } from './src/api/services/formsService';

const submission = await formsService.submitForm('template-id', {
  name: 'John Doe',
  email: 'john@example.com',
  answers: [
    { fieldId: 'q1', answer: 'Yes' },
    { fieldId: 'q2', answer: 'No' },
  ],
});
```

### 6.4 Test Real-Time Subscription

```typescript
import { realtimeService } from './src/api/services/realtimeService';

const unsubscribe = await realtimeService.subscribeToTable('incidents', {
  onInsert: (incident) => console.log('New incident:', incident),
  onUpdate: (incident) => console.log('Updated incident:', incident),
  onDelete: (id) => console.log('Deleted incident:', id),
});

// Unsubscribe when done
unsubscribe();
```

## 7. Environment Variables

Create a `.env.local` file in your project root:

```
# API Configuration
REACT_APP_API_URL=https://your-insforge-project.vercel.app
REACT_APP_ANON_KEY=your_insforge_anon_key

# Email Configuration
REACT_APP_EMAIL_FROM=noreply@safecloudafrica.com
REACT_APP_EMAIL_FROM_NAME=SafeCloud Africa

# Feature Flags
REACT_APP_ENABLE_REAL_TIME=true
REACT_APP_ENABLE_EMAIL_NOTIFICATIONS=true
REACT_APP_ENABLE_FORM_SUBMISSIONS=true
```

## 8. Deployment Checklist

- [ ] Email service edge function deployed to InsForge
- [ ] SendGrid API key configured in environment variables
- [ ] Storage buckets created and configured
- [ ] Database schema deployed (form_submissions table)
- [ ] RLS policies enabled on all tables
- [ ] Real-time subscriptions tested in development
- [ ] Email sending tested with test account
- [ ] File upload tested with storage service
- [ ] Form submissions working end-to-end
- [ ] Security policies initialized for all companies
- [ ] Build passes with all Phase 2 code
- [ ] Environment variables set in Vercel production

## 9. Troubleshooting

### Email Not Sending
- Check email service logs in InsForge
- Verify SendGrid API key is correct
- Check spam folder for test emails
- Ensure email template variables match submission format

### Storage Upload Failing
- Verify bucket name matches exactly (case-sensitive)
- Check bucket exists in InsForge console
- Verify file size doesn't exceed limit (50MB default)
- Check browser console for CORS errors

### Real-Time Not Working
- Open browser DevTools Network tab, filter for "ws://"
- Verify WebSocket connection is established
- Check that RLS policies allow row access
- Verify user has valid InsForge session

### Form Submission Errors
- Verify form_submissions table exists in database
- Check that RLS policies are enabled
- Verify template_id exists in form_templates table
- Check submitted data matches schema

## 10. Next Steps

1. **Deploy to Staging**: Push to staging branch and verify integration
2. **Load Testing**: Test with realistic user volumes
3. **Security Audit**: Review RLS policies and data encryption
4. **Documentation**: Update user guides with new features
5. **Training**: Create training materials for users
6. **Monitoring**: Set up alerts for email failures, storage issues
7. **Metrics**: Track form submissions, notification delivery rates
8. **Phase 3**: Start planning MFA, concurrent session limits, OCR

---

For more details, refer to:
- [InsForge Documentation](https://docs.insforge.com)
- [SendGrid Email API](https://docs.sendgrid.com)
- [Postgres JSON Functions](https://www.postgresql.org/docs/current/functions-json.html)
