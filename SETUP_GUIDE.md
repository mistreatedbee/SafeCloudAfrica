# SafeCloud Africa - Quick Setup Guide

## Fix the 400 Errors & "Ol" Reference Error

### Step 1: Create `.env.local` file

In your project root (`c:\Users\lenovo\Downloads\SafeCloudAfrica\`), create a new file named `.env.local` with:

```bash
VITE_API_MODE=insforge
VITE_INSFORGE_BASE_URL=https://pas375jb.us-west.insforge.app
VITE_INSFORGE_ANON_KEY=YOUR_ACTUAL_ANON_KEY_HERE
VITE_SHOW_ENV_DEBUG=false
```

**Replace `YOUR_ACTUAL_ANON_KEY_HERE`** with your real InsForge anon key.

### Step 2: Get Your InsForge Anon Key

1. Go to https://pas375jb.us-west.insforge.app (your InsForge dashboard)
2. Look for **Settings → API Keys** or **Project Settings**
3. Find the **Anon (Public) Key** - copy it
4. Paste it into `.env.local` above

### Step 3: Restart Development Server

```bash
# Stop the current dev server (Ctrl+C)
# Then restart:
npm run dev
```

Clear your browser cache:
- **Chrome/Edge**: Ctrl+Shift+Delete
- **Firefox**: Ctrl+Shift+Delete
- **Safari**: Cmd+Shift+Delete

### Step 4: Test

Visit `http://localhost:5173` and try to log in or create an account.

---

## Troubleshooting

### Still Getting 400 Errors?

**Check these things:**

1. **Is the anon key correct?**
   - Should look like: `eyJhbGciOi...` (a long string starting with `ey`)
   - If it says "PASTE_YOUR_ANON_KEY", you didn't update it

2. **Is the base URL correct?**
   - Must start with `https://` (not `http://`)
   - Must match your InsForge project URL

3. **Did you restart the dev server?**
   - Stop with `Ctrl+C`
   - Run `npm run dev` again

### Still Getting "Ol" Reference Error?

This is typically a build/compilation issue:

```bash
# Clear cache and rebuild
rm -rf node_modules/.vite
npm run build

# Or in Windows PowerShell:
Remove-Item -Recurse node_modules/.vite
npm run build
```

Then restart dev server:
```bash
npm run dev
```

---

## Quick Deployment Checklist

Once local testing works:

1. **Set same environment variables in Vercel**:
   - Go to Vercel project settings
   - Add Environment Variables:
     - `VITE_INSFORGE_BASE_URL`
     - `VITE_INSFORGE_ANON_KEY`

2. **Deploy**:
   ```bash
   git add .env.local
   git commit -m "Configure InsForge environment"
   git push origin main
   ```

3. **Vercel auto-deploys**

---

## Need Help?

Check these files:
- `docs/PRODUCTION-DEPLOYMENT.md` - Full setup guide
- `docs/QUICK-DEPLOY.md` - 5-minute deployment
- `env.example` - Example configuration

