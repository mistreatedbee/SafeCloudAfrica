# SafeCloud Africa - Getting Started Checklist

## ✅ Immediate Actions (Next 10 Minutes)

### Step 1: Fix Environment (2 min)
- [ ] Create `.env.local` file in project root
- [ ] Copy content from `.env.local.example` (if exists) or use:
```
VITE_API_MODE=insforge
VITE_INSFORGE_BASE_URL=https://pas375jb.us-west.insforge.app
VITE_INSFORGE_ANON_KEY=YOUR_ACTUAL_KEY_HERE
VITE_SHOW_ENV_DEBUG=false
```
- [ ] Replace `YOUR_ACTUAL_KEY_HERE` with your InsForge anon key
- [ ] Save file

### Step 2: Restart Development Server (2 min)
- [ ] Press `Ctrl+C` in terminal to stop current server
- [ ] Run `npm run dev`
- [ ] Wait for "Local: http://localhost:5173"

### Step 3: Clear Browser Cache (1 min)
- [ ] Press `Ctrl+Shift+Delete` (or Cmd+Shift+Delete on Mac)
- [ ] Clear "All time"
- [ ] Refresh browser

### Step 4: Test (5 min)
- [ ] Visit http://localhost:5173
- [ ] Check browser console (F12) - should have NO errors
- [ ] Try to sign up or log in
- [ ] Click on Incidents or Dashboard

---

## 🔍 Troubleshooting These Errors

### Error: "Failed to load resource: the server responded with a status of 400"
**Likely Cause**: Missing InsForge anon key  
**Solution**:
1. Go to https://pas375jb.us-west.insforge.app (your InsForge dashboard)
2. Find API Keys or Project Settings
3. Copy the "Anon Key" (public key, safe to expose)
4. Paste into `.env.local` → `VITE_INSFORGE_ANON_KEY`
5. Restart dev server: `npm run dev`

### Error: "Cannot access 'Ol' before initialization"
**Likely Cause**: Build cache or module loading order  
**Solution**:
1. Stop dev server: `Ctrl+C`
2. Delete cache: `rm -rf node_modules/.vite` (or delete `.vite` folder manually)
3. Restart: `npm run dev`
4. Clear browser cache: `Ctrl+Shift+Delete`
5. Refresh page

### Still Getting Errors?
**Check these**:
- Is `.env.local` in project root? (not in `src/` or `docs/`)
- Is `VITE_INSFORGE_ANON_KEY` a long string starting with `ey`?
- Is `VITE_INSFORGE_BASE_URL` exactly `https://pas375jb.us-west.insforge.app`?
- Did you restart dev server after editing `.env.local`?

---

## 🚀 Next: Local Testing (15 minutes)

Once errors are fixed:

### 1. Create Test Account
- [ ] Click "Sign Up" on home page
- [ ] Enter email and password
- [ ] Click "Create Account"
- [ ] You should be logged in

### 2. Create Test Company
- [ ] Click your profile (top right)
- [ ] Look for "Create Company" or "New Workspace"
- [ ] Enter company name, select license type
- [ ] Click create

### 3. Test Core Features
- [ ] Go to Incidents page → Create Incident
- [ ] Go to Risks page → Create Risk Assessment
- [ ] Go to NCRs page → Create NCR
- [ ] Go to Tasks page → Create Task
- [ ] Go to Dashboard → Should see data

### 4. Verify No Errors
- [ ] Open browser console (F12)
- [ ] Should be clean - no red errors
- [ ] Only warnings (if any) are OK

---

## 🌐 Production Deployment (When Ready)

See: `docs/QUICK-DEPLOY.md` (5-minute version)  
Or: `docs/PRODUCTION-DEPLOYMENT.md` (full version)

Quick steps:
1. Execute `docs/phase2-schema.sql` in InsForge
2. Set environment variables in Vercel dashboard
3. Push code to GitHub
4. Vercel auto-deploys

---

## 📚 Documentation Map

| Document | When to Read | Time |
|----------|--------------|------|
| **This file** | Right now | 10 min |
| `SETUP_GUIDE.md` | If getting errors | 5 min |
| `TECHNICAL_REFERENCE.md` | Understanding architecture | 20 min |
| `docs/QUICK-DEPLOY.md` | Ready to go live | 5 min |
| `docs/PRODUCTION-DEPLOYMENT.md` | Need detailed deploy steps | 30 min |
| `docs/FINAL-SUMMARY.md` | Project overview | 15 min |

---

## 💡 Pro Tips

1. **Keep `.env.local` secret** - Never commit to GitHub (already in .gitignore)
2. **Different keys per environment** - Dev `.env.local`, Prod in Vercel settings
3. **Clear cache often** - Vite caching can be tricky: `Ctrl+Shift+Delete` + reload
4. **Check InsForge dashboard** - See real-time API logs there
5. **Use browser DevTools** - Network tab shows actual API calls being made

---

## ✨ Features Now Available

- ✅ **25+ pages** - All modules implemented
- ✅ **Real-time data** - Dashboard updates live
- ✅ **Multi-company** - Complete isolation with RLS
- ✅ **Role-based access** - admin, manager, supervisor, employee, consultant, auditor
- ✅ **Export** - PDF and CSV export (Phase 3 ready)
- ✅ **Licensing** - Trial management and feature gating (Phase 3 ready)
- ✅ **ISO mapping** - ISO 45001, 14001, 9001 framework (Phase 3 ready)
- ✅ **Compliance scoring** - Real-time metrics (Phase 3 ready)

---

## 🎯 Success = When You See:

1. ✅ No 400 errors in console
2. ✅ No "Ol" reference errors
3. ✅ Can log in successfully
4. ✅ Can create incidents/NCRs/risks
5. ✅ Dashboard shows real data
6. ✅ Mobile view works
7. ✅ Can logout

**Once all 7 are green** → You're ready for production! 🚀

---

## 📞 If Still Stuck

1. **Check environment**:
   ```bash
   echo %VITE_INSFORGE_ANON_KEY%  # Windows
   # or
   echo $VITE_INSFORGE_ANON_KEY   # Mac/Linux
   ```
   Should output your key (not "CHANGE_ME" or "PASTE_YOUR...")

2. **Check file exists**:
   ```bash
   ls .env.local  # Mac/Linux
   dir .env.local # Windows
   ```
   Should exist in project root

3. **Check dev server running**:
   - Should see green "Local: http://localhost:5173"
   - Not seeing it? Run `npm run dev`

4. **Check browser logs**:
   - F12 → Console tab
   - Screenshot errors and check `SETUP_GUIDE.md`

---

**Next Step**: If errors are fixed → Go to `TECHNICAL_REFERENCE.md`  
**Ready to deploy**: Go to `docs/QUICK-DEPLOY.md`

Good luck! 🎉

