# SafeCloud Africa - Quick Deployment (5 Minutes)

## 1. Database (InsForge)

```bash
# Copy-paste contents of docs/phase2-schema.sql into InsForge SQL Editor
# Execute it

# Verify:
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
# Should return: 47
```

## 2. Frontend (Vercel)

**Vercel Project Settings → Environment Variables**:

```
VITE_INSFORGE_BASE_URL=https://your-project.insforge.app
VITE_INSFORGE_ANON_KEY=your-anon-key-here
VITE_API_MODE=insforge
```

**Deploy**:
```bash
# Push to GitHub main branch (auto-deploys)
# OR manually: vercel deploy --prod
```

## 3. Seed Demo Data (Optional)

```bash
export INSFORGE_BASE_URL=https://your-project.insforge.app
export INSFORGE_ANON_KEY=your-anon-key
node scripts/seed-demo.mjs
```

## 4. Test

Visit your Vercel URL and:
- Sign up a new account
- Create incident/NCR/risk/task
- Check dashboard

**Done!** 🚀

---

For detailed setup, see `docs/PRODUCTION-DEPLOYMENT.md`
