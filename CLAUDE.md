# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Head First! is a web-based TTRPG (Tabletop Role-Playing Game) character sheet application with **real-time collaboration**. Multiple users can edit the same character sheet simultaneously via Socket.io. (However, things are kept simple in many cases, there is no conflict handling, and more.)

The key design principle is **template-driven configuration**: Game Masters customize the entire character sheet (attributes, skills, localization, styling) through JSON files without code changes.

## Project Structure

```
HeadFirst/
├── server/                   # Node.js backend
│   ├── index.js              # Express + Socket.io entry point
│   ├── config.js             # Environment variable handling
│   ├── db/
│   │   ├── connection.js     # MongoDB connection
│   │   ├── models/Sheet.js   # Mongoose schema for sheets
│   │   └── cleanup.js        # Daily cleanup of old sheets
│   ├── socket/
│   │   └── handlers.js       # Socket.io event handlers
│   └── services/
│       └── sheetBuffer.js    # In-memory buffer with DB sync
├── public/                   # Static frontend files
│   ├── index.html            # Entry point
│   ├── script.js             # Main application logic
│   ├── sync.js               # Real-time sync client
│   ├── styles.css            # Core styling
│   ├── colors.css            # 13-color palette system
│   ├── default.json          # Default template
│   ├── svg/                  # UI icons
│   └── multi-user indicator svgs/
├── package.json
├── .env                      # Environment config (not in git)
└── .gitignore
```

## Development

### URL Routing

| URL | Behavior |
|-----|----------|
| `/` | No sync (local only, like original app) |
| `/nosync` | No sync (explicit) |
| `/:sheetId` | Real-time sync enabled (e.g., `/my-group-2024`) |

Sheet IDs: Any characters except `.` `/` `\` and control characters, length 1-64. **Case-insensitive** (e.g., `Test` and `test` → same sheet).

### Environment Variables (.env)

```env
MONGODB_URI=mongodb://localhost:27017/headfirst
PORT=3000
BUFFER_SYNC_INTERVAL=5      # Minutes between DB syncs
CLEANUP_DAYS=30             # Days until unused sheets are deleted
```

## Architecture

### Frontend (public/)

**Core Files:**
- `index.html` - Entry point with semantic HTML structure
- `script.js` - All application logic (~1700 lines)
- `sync.js` - Socket.io client, handles real-time updates
- `styles.css` - Core styling with CSS Grid/Flexbox
- `colors.css` - Color palette using CSS custom properties

**Global State (script.js):**
- `gmTemplate` - GM's configuration (from JSON)
- `playerData` - Current character data
- `editMode`, `compactMode`, `ecMode`, `infoMode` - UI state toggles
- `crewVisible`, `bgVisible` - Panel visibility

**Key Functions (script.js):**
- `applyImported(json, options)` - Process imported JSON, initialize state
- `applyRemoteSmallChange(json)` - Apply sync updates without losing focus
- `renderAll()` - Main render orchestrator
- `renderAttributes()` - Build attribute/sub-attribute UI
- `updateAttributePointLabels()` - Update labels in-place (no re-render)
- `toggleEditMode()` - Switch between view/edit modes with animations

**Sync Module (sync.js):**
- `initSync()` - Check URL, connect socket if sync mode
- `broadcastChange()` - Send local changes to server
- `handleRemoteUpdate()` - Apply changes from other clients
- `showReconnectingOverlay()` / `hideReconnectingOverlay()`

### Backend (server/)

**Socket.io Events:**

Client → Server:
- `join-room { sheetId }` - Join a sheet room
- `sheet-update { set_by_gm, set_by_player, gmHash }` - Send changes

Server → Client:
- `sheet-data { set_by_gm, set_by_player, gmHash, isNew }` - Initial data
- `sheet-update { ..., changeType }` - Remote changes (`breaking` or `small`)
- `user-count { count }` - Number of connected users

**Change Detection:**
- `gmHash` = hash of `set_by_gm` object
- Same hash → `small` change (only player data changed, update in-place)
- Different hash → `breaking` change (template changed, full re-render)

**Buffer Strategy (sheetBuffer.js):**
- Sheets kept in memory for fast access
- Synced to MongoDB every X minutes (configurable)
- Immediately saved when last user leaves
- Old sheets cleaned up daily (configurable threshold)

## JSON Template Structure

Templates use `set_by_gm` object containing:
- `localization` - All UI strings (supports any language)
- `style` - CSS variable overrides
- `attributes` - Array with `name`, `color`, `column`, `sub_attribute_suggestions`
- `scales` - Resource bars (health, sanity, etc.)
- `infos`, `freetexts`, `other_players` - Character info fields
- Feature flags: `show_subattributes`, `show_success_levels`, `show_infopage`, etc.
- Point allocation limits: `attribute_points`, `sub_attribute_points`, min/max values

## Important Patterns

### Focus Preservation on Sync

When receiving remote updates, use `applyRemoteSmallChange()` instead of full `applyImported()` to avoid losing focus/keyboard on mobile. It updates input values in-place without recreating DOM elements.

### Data Attributes for Targeting

Elements use `data-*` attributes for efficient querying:
- `data-info-index`, `data-scale-index`, `data-freetext-index`
- `data-attr-index`, `data-attr-label`
- `data-sub-input`, `data-sub-input-val`, `data-sub-label`
