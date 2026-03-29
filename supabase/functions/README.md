# Edge Functions — DO NOT DEPLOY FROM LOVABLE

Edge functions in this directory are deployed via GitHub Actions, NOT by Lovable.

**Why:** Lovable overwrites edge functions with stale cached versions on every frontend deploy. This has broken QB integration, email sending, and document processing repeatedly.

**How it works:**
1. Edge function source lives in `supabase/functions/{function-name}/index.ts`
2. When changes are pushed to `main` in `supabase/functions/`, GitHub Actions deploys them to Supabase
3. Lovable handles ONLY frontend code (src/, public/, etc.)

**To update an edge function:**
- Edit the `index.ts` file in the correct function directory
- Push to main
- GitHub Actions deploys automatically

**DO NOT** paste edge function code into Lovable prompts. It will cache and redeploy broken versions.
