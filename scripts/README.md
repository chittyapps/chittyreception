# Notion ↔ GitHub Sync

Bidirectional sync between Notion ChittyCan™ databases and GitHub Projects/Issues.

## Quick Start

```bash
# Install dependencies (already done)
pnpm install

# Get tokens from 1Password
op item get "Notion Integration Token" --fields token
op item get "GitHub Personal Access Token" --fields token

# Create .env
cat > .env << EOF
NOTION_TOKEN=secret_xxxxx
GITHUB_TOKEN=ghp_xxxxx
GITHUB_ORG=your-org-name
NOTION_PROJECTS_DS=https://www.notion.so/.../ds/999c414c06c54064a51b921193830968?db=...
NOTION_ACTIONS_DS=https://www.notion.so/.../ds/6b52d580f8104009964d478039c144e1?db=...
DRY_RUN=true
EOF

# Run sync
pnpm sync:dry   # Test first (no changes)
pnpm sync:live  # Apply changes
```

## Features

- ✅ **Two-way sync** with conflict detection
- ✅ **Auto-create** GitHub Projects from Notion
- ✅ **Sync tracking** with Last Sync timestamps
- ✅ **DRY_RUN mode** for safe testing
- ✅ **Status mapping** between platforms
- ✅ **Type-safe** with Zod validation

## Integration with ChittyCan

**Note:** ChittyCan CLI already has Notion ↔ GitHub sync built-in (`can sync`).

### When to use each:

**ChittyCan** (`can sync`):
- Full session tracking
- Multiple project management
- Integrated hooks
- Persistent configuration

**scripts/sync.ts**:
- ProjectsV2-specific features
- Standalone operation
- Fine-grained control
- Testing/development

**Recommended**: Use ChittyCan for most workflows. Use this script for:
- ProjectsV2 features not in ChittyCan
- Standalone sync without full ChittyCan install
- Custom sync logic development

## Commands

```bash
# Dry run (safe, shows what would change)
pnpm sync:dry

# Live sync (applies changes)
pnpm sync:live

# Custom repository
pnpm ts-node scripts/sync.ts chittyauth
```

## Environment Variables

Required in `.env`:

```env
NOTION_TOKEN          # From https://www.notion.so/my-integrations
NOTION_PROJECTS_DS    # ChittyCan™ Project Continuity Tracker URL
NOTION_ACTIONS_DS     # ChittyCan™ Project Actions URL
GITHUB_TOKEN          # Personal access token (repo, project scopes)
GITHUB_ORG            # Your GitHub organization
DRY_RUN              # true = test, false = apply
```

## How It Works

1. **Reads** from both Notion and GitHub
2. **Compares** timestamps to detect changes
3. **Detects conflicts** if both sides changed
4. **Syncs** in the appropriate direction
5. **Updates** Last Sync timestamp in Notion

### Status Mapping

**Notion → GitHub:**
- Not Started, In Progress, Blocked, On Hold → OPEN
- Completed, Cancelled → CLOSED

**GitHub → Notion:**
- OPEN → In Progress
- CLOSED → Completed

## Database Schema

### Notion: ChittyCan™ Project Continuity Tracker

- `Name` (Title)
- `Status` (Select)
- `Description` (Text)
- `GitHub Project ID` (Text) - auto-synced
- `GitHub Project URL` (URL) - auto-synced
- `Last Sync` (Date) - auto-synced

### Notion: ChittyCan™ Project Actions

- `Name` (Title)
- `Status` (Select)
- `Project` (Relation)
- `Description` (Text)
- `GitHub Issue ID` (Text) - auto-synced
- `GitHub Issue #` (Number) - auto-synced
- `GitHub Issue URL` (URL) - auto-synced
- `Last Sync` (Date) - auto-synced

## Troubleshooting

**"Database ID extraction failed"**
- Ensure URLs include full database view path

**"Unauthorized" from Notion**
- Verify token and database sharing

**"Unauthorized" from GitHub**
- Check token scopes (repo, project)

**Conflicts detected**
- Manual resolution required
- Update one side, then re-sync

## Files

```
scripts/
├── sync.ts       # Main sync script (720 lines)
└── README.md     # This file
```

## License

Part of the ChittyOS ecosystem.
