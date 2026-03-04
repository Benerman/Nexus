# Nexus Theme System

Developer reference for the Nexus theme system — built-in themes, custom themes, and CSS variables.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  index.css                                                  │
│  :root { --bg-primary: ...; ... }      ← midnight defaults  │
│  [data-theme="retro"] { ... }          ← built-in overrides │
│  [data-theme="terminal"] { ... }                            │
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  <style id="nexus-custom-themes">      ← injected at runtime│
│  [data-theme="custom-abc123"] { ... }  ← from localStorage  │
│  [data-theme="custom-def456"] { ... }                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  document.documentElement                                   │
│  setAttribute('data-theme', 'custom-abc123')                │
│  ↑ switches active theme                                    │
└─────────────────────────────────────────────────────────────┘
```

### Data flow

1. **Built-in themes** are defined in `client/src/index.css` as `[data-theme="<id>"]` rule sets.
2. **Custom themes** are stored in `localStorage` key `nexus_custom_themes` as a JSON array of theme objects.
3. On startup, `injectCustomThemeStyles()` (in `App.js`) reads custom themes and injects their CSS into a `<style id="nexus-custom-themes">` element.
4. The active theme ID is stored in `localStorage` key `nexus_theme` and applied via `document.documentElement.setAttribute('data-theme', id)`.
5. Both `nexus_theme` and `nexus_custom_themes` sync to the server via `user:settings-update` Socket.IO event.

## CSS Variable Reference

All themes (built-in and custom) must define these CSS custom properties:

### Core Backgrounds

| Variable | Description | Midnight Default |
|----------|-------------|-----------------|
| `--bg-primary` | Main content area background | `#1a1c1f` |
| `--bg-secondary` | Sidebar, panels, secondary surfaces | `#141618` |
| `--bg-tertiary` | Deepest background, input fields | `#111214` |
| `--bg-floating` | Popups, modals, context menus | `#18191c` |
| `--bg-modifier-hover` | Hover state overlay | `rgba(255,255,255,0.06)` |
| `--bg-modifier-active` | Active/pressed state overlay | `rgba(255,255,255,0.1)` |
| `--bg-modifier-selected` | Selected item highlight | `rgba(59,130,246,0.3)` |

### Text

| Variable | Description | Midnight Default |
|----------|-------------|-----------------|
| `--text-normal` | Primary body text | `#dcddde` |
| `--text-muted` | Secondary/dimmed text | `#72767d` |
| `--text-link` | Hyperlink color | `#00b0f4` |
| `--text-positive` | Success text | `#57f287` |
| `--text-warning` | Warning text | `#faa61a` |
| `--text-danger` | Error/danger text | `#ed4245` |
| `--header-primary` | Headings, emphasized text | `#ffffff` |
| `--header-secondary` | Subheadings, labels | `#b9bbbe` |

### Brand & Status Colors

| Variable | Description | Midnight Default |
|----------|-------------|-----------------|
| `--brand-500` | Primary accent (buttons, active states) | `#3B82F6` |
| `--brand-600` | Darker accent (hover states) | `#2563EB` |
| `--brand-experiment` | Alias for brand-500 | `#3B82F6` |
| `--brand-primary` | Alias for brand-500 | `#3B82F6` |
| `--green` | Success color | `#3ba55c` |
| `--red` | Danger/error color | `#ed4245` |
| `--yellow` | Warning color | `#faa61a` |

### Interactive States

| Variable | Description | Midnight Default |
|----------|-------------|-----------------|
| `--interactive-normal` | Default interactive element color | `#b9bbbe` |
| `--interactive-hover` | Hovered interactive element | `#dcddde` |
| `--interactive-active` | Active interactive element | `#ffffff` |
| `--interactive-muted` | Disabled/muted interactive | `#4f545c` |
| `--channel-default` | Channel name default color | `#8e9297` |
| `--channels-default` | Alias for channel-default | `#8e9297` |

### Chrome

| Variable | Description | Midnight Default |
|----------|-------------|-----------------|
| `--scrollbar-thin-thumb` | Scrollbar thumb | `#202225` |
| `--scrollbar-thin-track` | Scrollbar track | `transparent` |
| `--elevation-low` | Subtle shadow/border | box-shadow value |
| `--elevation-medium` | Card-level shadow | `0 4px 4px rgba(0,0,0,0.16)` |
| `--elevation-high` | Modal-level shadow | `0 8px 16px rgba(0,0,0,0.24)` |
| `--radius-sm` | Small border radius | `4px` |
| `--radius-md` | Medium border radius | `8px` |
| `--radius-lg` | Large border radius | `16px` |
| `--border-subtle` | Subtle border | `1px solid rgba(255,255,255,0.06)` |
| `--border-prominent` | Prominent border | `1px solid rgba(255,255,255,0.12)` |
| `--border-input` | Input field border | `1px solid rgba(255,255,255,0.07)` |
| `--transition-speed` | Animation duration | `0.15s` |
| `--transition-fn` | Animation easing | `ease` |
| `--button-shadow` | Button box-shadow | `none` |
| `--input-shadow` | Input box-shadow | `none` |

### Typography (non-theme, root only)

| Variable | Value |
|----------|-------|
| `--font-display` | `'Space Grotesk', sans-serif` |
| `--font-body` | `'DM Sans', sans-serif` |
| `--font-code` | `'Courier New', monospace` |

## How to Add a Built-in Theme

1. Choose a unique ID (lowercase, alphanumeric, no spaces). Example: `ocean`.

2. Add theme metadata to the `THEMES` array in `client/src/components/SettingsModal.js`:
   ```js
   { id: 'ocean', name: 'Deep Ocean', description: 'Calm blue depths', colors: ['#0a1628', '#061020', '#00b4d8', '#caf0f8'] },
   ```
   The 4 colors are: `[bgPrimary, bgSecondary, accent, textPrimary]` — displayed as swatches in the theme picker.

3. Add CSS variables in `client/src/index.css`:
   ```css
   [data-theme="ocean"] {
     --bg-primary: #0a1628;
     --bg-secondary: #061020;
     --bg-tertiary: #040c18;
     /* ... all variables from the reference above ... */
   }
   ```

4. (Optional) Add theme-specific component overrides after the variable block:
   ```css
   [data-theme="ocean"] .chat-input-box:focus-within {
     border-color: rgba(0,180,216,0.4);
     box-shadow: 0 0 8px rgba(0,180,216,0.2);
   }
   ```

5. Test with `npm run build` from `client/` to ensure no CSS errors.

## Custom Theme JSON Schema

Custom themes can be imported/exported as `.nexus-theme.json` files:

```json
{
  "nexus_theme": true,
  "version": 1,
  "name": "My Theme",
  "description": "Optional description",
  "colors": {
    "bgPrimary": "#1a1c1f",
    "bgSecondary": "#141618",
    "bgFloating": "#18191c",
    "textPrimary": "#dcddde",
    "textSecondary": "#72767d",
    "textLink": "#00b0f4",
    "accent": "#3B82F6",
    "success": "#3ba55c",
    "warning": "#faa61a",
    "danger": "#ed4245"
  }
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `nexus_theme` | `boolean` | Yes | Must be `true` — identifies the file as a Nexus theme |
| `version` | `number` | Yes | Schema version (currently `1`) |
| `name` | `string` | Yes | Display name (max 32 chars) |
| `description` | `string` | No | Short description (max 100 chars) |
| `colors` | `object` | Yes | All 10 color fields as hex strings |

### Color Derivation

From the 10 user-provided colors, `generateThemeCSS()` derives all 34+ CSS variables:

| Derived Variable | Formula |
|-----------------|---------|
| `--bg-tertiary` | `bgPrimary` brightness -15% (dark) or +8% (light) |
| `--brand-600` | `accent` brightness -15% |
| `--bg-modifier-hover` | `rgba(255,255,255,0.06)` (dark) or `rgba(0,0,0,0.08)` (light) |
| `--bg-modifier-active` | `rgba(255,255,255,0.1)` (dark) or `rgba(0,0,0,0.14)` (light) |
| `--bg-modifier-selected` | `accent` at 30% opacity |
| `--header-primary` | `#ffffff` (dark) or `#000000` (light) |
| `--header-secondary` | `textPrimary` brightness adjusted |
| `--interactive-*` | Derived from `textPrimary`/`textSecondary` |
| `--scrollbar-thin-thumb` | `bgPrimary` brightness +30% (dark) or -20% (light) |
| `--border-*` | White alpha (dark) or black alpha (light) |

Light vs dark detection uses relative luminance of `bgPrimary` (threshold: 0.2).

## Internal Storage Format

Custom themes in `localStorage` (`nexus_custom_themes`) store an array:

```json
[
  {
    "id": "custom-a1b2c3d4-...",
    "name": "My Theme",
    "description": "",
    "colors": { ... },
    "css": "[data-theme=\"custom-a1b2c3d4-...\"] { ... }",
    "createdAt": 1709500000000
  }
]
```

The `css` field contains the pre-generated CSS rule set, injected directly into the DOM. The `colors` field preserves the original 10 inputs for editing.

## Theme Picker UI

The appearance tab in Settings shows:

1. **Built-in Themes** — a grid of cards with 4-color swatches, click to activate
2. **Custom Themes** — same card style, plus Edit/Export/Delete action buttons
3. **Create/Import buttons** — create opens an inline editor; import reads a `.nexus-theme.json` file
4. **Theme Editor** — inline panel with name, description, and 10 color pickers grouped into Backgrounds, Text, Accent, and Status categories. Changes preview live.
