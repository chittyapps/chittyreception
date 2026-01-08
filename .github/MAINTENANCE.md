# ChittyReception Maintenance Guide

## Keeping the Project Clean

This guide ensures the project stays organized and free of clutter.

## Regular Cleanup Checklist

### Weekly
- [ ] Check for uncommitted `.env` files
- [ ] Remove any `.log` files
- [ ] Clear temporary build artifacts

### Monthly
- [ ] Update dependencies: `pnpm update`
- [ ] Run security audit: `pnpm audit`
- [ ] Check for unused dependencies
- [ ] Review and consolidate documentation

### Quarterly
- [ ] Deep clean node_modules: `rm -rf node_modules && pnpm install`
- [ ] Review all markdown docs for accuracy
- [ ] Check for deprecated dependencies
- [ ] Update TypeScript and tooling versions

## File Organization Rules

### ✅ Keep These Files
```
/
├── src/              # Source code only
├── scripts/          # Utility scripts (sync, etc.)
├── config/           # Configuration data
├── .github/          # GitHub workflows & docs
├── package.json      # Dependencies
├── pnpm-lock.yaml    # Lock file (pnpm ONLY)
├── tsconfig.json     # TypeScript config
├── wrangler.toml     # Cloudflare config
├── .gitignore        # Git ignore rules
├── .env.example      # Environment template
└── *.md              # Documentation
```

### ❌ Never Commit These
```
.env                  # Secrets
.env.local            # Local overrides
node_modules/         # Dependencies
.wrangler/            # Build artifacts
dist/                 # Compiled output
*.log                 # Log files
*.tmp                 # Temporary files
package-lock.json     # Wrong lock file (using pnpm)
yarn.lock             # Wrong lock file (using pnpm)
```

### 🔥 Delete on Sight
```
*.obsolete            # Old files
*.bak                 # Backup files
*.old                 # Deprecated files
*~                    # Editor backups
.DS_Store             # macOS metadata
Thumbs.db             # Windows metadata
```

## Package Manager: pnpm ONLY

**Always use pnpm:**
```bash
pnpm install          # ✅ Correct
pnpm add package      # ✅ Correct
pnpm remove package   # ✅ Correct

npm install           # ❌ Wrong - creates package-lock.json
yarn add              # ❌ Wrong - creates yarn.lock
```

**If you accidentally use npm/yarn:**
```bash
rm package-lock.json yarn.lock
pnpm install
```

## Documentation Standards

### One Purpose Per File
- `README.md` - Project overview and quick start
- `SETUP.md` - Initial setup instructions
- `DEPLOY.md` - Deployment procedures
- `INTEGRATION.md` - Service integration details
- `SONA-GUIDE.md` - Sona AI configuration
- `scripts/README.md` - Sync tool documentation

### Avoid Duplication
- ❌ Don't create multiple "getting started" docs
- ❌ Don't duplicate setup instructions
- ✅ Reference other docs instead of copying
- ✅ Keep one source of truth per topic

### Consolidation Rules
If you create a new doc, ask:
1. Does this info exist elsewhere?
2. Can I link to existing docs instead?
3. Would a section in existing doc work?
4. Is this truly unique content?

## Dependency Management

### Adding Dependencies
```bash
# Check if really needed first
pnpm why package-name

# Add only if necessary
pnpm add package-name

# Document why in package.json or README
```

### Removing Dependencies
```bash
# Find unused deps
pnpm list --depth=0

# Check usage
grep -r "package-name" src/

# Remove if unused
pnpm remove package-name
```

### Updating Dependencies
```bash
# Check what's outdated
pnpm outdated

# Update specific package
pnpm update package-name

# Update all (carefully!)
pnpm update

# Test after updating
pnpm typecheck
pnpm test
```

## Code Quality Gates

### Before Committing
```bash
# 1. Type check
pnpm typecheck

# 2. Build test
pnpm build

# 3. Check for loose files
git status --ignored

# 4. Review changes
git diff
```

### Automated Checks
Consider adding pre-commit hook:
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Prevent commits with loose files
if ls *.log >/dev/null 2>&1; then
  echo "❌ Log files found. Remove before committing."
  exit 1
fi

if [ -f package-lock.json ]; then
  echo "❌ package-lock.json found. Use pnpm only."
  exit 1
fi

# Type check
pnpm typecheck || exit 1

echo "✅ Pre-commit checks passed"
```

## Cleanup Commands

### Quick Clean
```bash
# Remove build artifacts
rm -rf .wrangler dist

# Remove logs
rm -f *.log

# Remove temp files
find . -name "*.tmp" -delete
find . -name ".DS_Store" -delete
```

### Deep Clean
```bash
# Full reset
rm -rf node_modules .wrangler dist
pnpm install

# Verify everything works
pnpm typecheck
pnpm build
```

### Nuclear Option
```bash
# Complete fresh start
git clean -fdx  # ⚠️ CAREFUL: Deletes all untracked files
pnpm install
```

## Monitoring File Bloat

### Check Project Size
```bash
# Total size
du -sh .

# Largest directories
du -sh * | sort -h

# Node modules size
du -sh node_modules
```

### Identify Large Files
```bash
# Files over 1MB
find . -type f -size +1M | grep -v node_modules

# Should return nothing or only config/data files
```

## ChittyCan Integration

ChittyCan can help maintain cleanliness:
```bash
# Track cleanup sessions
can session start chittyreception-cleanup

# Log cleanup actions
can todo add "Removed obsolete files"
can todo add "Updated dependencies"
can todo complete 0

# End session
can session end "Monthly cleanup complete"
```

## Sync Script Maintenance

The sync script (`scripts/sync.ts`) should:
- ✅ Only sync, not create other files
- ✅ Log to console, not to files
- ✅ Store state in Notion, not locally
- ❌ Never create temp files
- ❌ Never write to project root

## Warning Signs

Watch for these red flags:

🚨 **Multiple lock files** - Pick one package manager
🚨 **Duplicate docs** - Consolidate content
🚨 **Temp files in git** - Update .gitignore
🚨 **Growing node_modules** - Review dependencies
🚨 **Build artifacts in src/** - Fix build config
🚨 **Log files everywhere** - Configure logging
🚨 **Files with .old/.bak** - Delete old versions

## Recovery Procedure

If the project gets messy:

1. **Audit current state**
   ```bash
   git status --ignored
   find . -name "*.obsolete" -o -name "*.bak"
   ```

2. **Remove clutter**
   ```bash
   git clean -n  # Dry run - see what would be deleted
   git clean -f  # Actually delete
   ```

3. **Rebuild clean**
   ```bash
   rm -rf node_modules
   pnpm install
   pnpm typecheck
   ```

4. **Document changes**
   ```bash
   git add .
   git commit -m "chore: cleanup project files"
   ```

## Questions?

- Check `.gitignore` for what should be ignored
- Review this guide before committing
- When in doubt, ask: "Does this file have a home?"
- If no clear home, it's probably clutter

## Maintenance Schedule

Set calendar reminders:
- **Weekly**: Quick scan for loose files
- **Monthly**: Dependency updates and docs review
- **Quarterly**: Deep clean and architecture review

---

**Remember**: A clean project is a maintainable project. Prevent clutter, don't just clean it up later.
