# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Head First! is a web-based TTRPG (Tabletop Role-Playing Game) character sheet application. It's a vanilla JavaScript single-page application with no build system - files are served as static assets.

The key design principle is **template-driven configuration**: Game Masters customize the entire character sheet (attributes, skills, localization, styling) through JSON files without code changes.

## Development

No build or install steps required. To run locally:
- Serve the directory with any static file server (e.g., `python -m http.server`, VS Code Live Server)
- Open `index.html` in a browser

The app loads `default.json` on startup. Alternative templates (like `neon shadows.json`) can be imported via drag-and-drop or the import button.

## Architecture

### Core Files
- `index.html` - Entry point with semantic HTML structure
- `script.js` - All application logic (~1600 lines, single file)
- `styles.css` - Core styling with CSS Grid/Flexbox
- `colors.css` - 13-color palette system using CSS custom properties

### Data Flow
1. **Load**: Fetch JSON template → parse into `gmTemplate` object
2. **Render**: `renderAll()` builds UI from template config
3. **Edit**: User changes → validate → update `playerData` → re-render section
4. **Export**: Merge `gmTemplate` + `playerData` → download as `.char` file

### Global State (script.js)
- `gmTemplate` - GM's configuration (from JSON)
- `playerData` - Current character data
- `editMode`, `compactMode`, `ecMode`, `infoMode` - UI state toggles
- `crewVisible`, `bgVisible` - Panel visibility

### Key Functions
- `applyImported(data)` - Process imported JSON, initialize state
- `renderAll()` - Main render orchestrator
- `renderAttributes()` - Build attribute/sub-attribute UI
- `toggleEditMode()` - Switch between view/edit modes with animations
- `handleFileImport()` / `handleExport()` - File I/O
- `applyCustomStyles()` - Apply JSON-defined CSS variable overrides

## JSON Template Structure

Templates use `set_by_gm` object containing:
- `localization` - All UI strings (supports any language)
- `style` - CSS variable overrides
- `attributes` - Array of attributes with `name`, `color`, `column`, `sub_attribute_suggestions`
- `scales` - Resource bars (health, sanity, etc.)
- `infos`, `freetexts`, `other_players` - Character info fields
- Feature flags: `show_subattributes`, `show_success_levels`, `show_infopage`, etc.
- Point allocation limits: `attribute_points`, `sub_attribute_points`, min/max values

## Assets
- `svg/` - UI icons (download, folder, info, etc.)
- `multi-user indicator svgs/` - Player presence indicators
- `palms.svg` - Decorative background (configurable via `deco_svg` in JSON)
