# CSS Variable Reference

Complete list of CSS custom properties used by Nexus themes.

## Backgrounds

| Variable | Default (Midnight) | Description |
|----------|-------------------|-------------|
| `--bg-primary` | `#1a1c1f` | Main content background |
| `--bg-secondary` | `#141618` | Sidebar, panels |
| `--bg-tertiary` | `#111214` | Deeper background areas |
| `--bg-floating` | `#18191c` | Modals, popups, tooltips |
| `--bg-modifier-hover` | `rgba(255,255,255,0.06)` | Hover state overlay |
| `--bg-modifier-active` | `rgba(255,255,255,0.1)` | Active/pressed state overlay |
| `--bg-modifier-selected` | `rgba(59,130,246,0.3)` | Selected item overlay |

## Text

| Variable | Default (Midnight) | Description |
|----------|-------------------|-------------|
| `--text-normal` | `#dcddde` | Body text |
| `--text-muted` | `#72767d` | Secondary/subtle text |
| `--text-link` | `#00b0f4` | Hyperlinks |
| `--text-positive` | `#57f287` | Success text |
| `--text-warning` | `#faa61a` | Warning text |
| `--text-danger` | `#ed4245` | Error/danger text |
| `--header-primary` | `#ffffff` | Primary headings |
| `--header-secondary` | `#b9bbbe` | Secondary headings |

## Brand & Status

| Variable | Default (Midnight) | Description |
|----------|-------------------|-------------|
| `--brand-500` | `#3B82F6` | Primary brand color |
| `--brand-600` | `#2563EB` | Darker brand variant |
| `--brand-experiment` | `#3B82F6` | Alias for brand-500 |
| `--brand-primary` | `#3B82F6` | Alias for brand-500 |
| `--green` | `#3ba55c` | Online/success status |
| `--red` | `#ed4245` | Danger/error status |
| `--yellow` | `#faa61a` | Warning/idle status |

## Interactive States

| Variable | Default (Midnight) | Description |
|----------|-------------------|-------------|
| `--interactive-normal` | `#b9bbbe` | Default interactive element |
| `--interactive-hover` | `#dcddde` | Hover state |
| `--interactive-active` | `#ffffff` | Active/focused state |
| `--interactive-muted` | `#4f545c` | Disabled/muted state |
| `--channel-default` | `#8e9297` | Default channel name color |

## Chrome

| Variable | Default (Midnight) | Description |
|----------|-------------------|-------------|
| `--scrollbar-thin-thumb` | `#202225` | Scrollbar thumb |
| `--scrollbar-thin-track` | `transparent` | Scrollbar track |
| `--elevation-low` | Shadow value | Subtle shadow |
| `--elevation-medium` | Shadow value | Medium shadow |
| `--elevation-high` | Shadow value | Strong shadow |

## Layout

| Variable | Default | Description |
|----------|---------|-------------|
| `--radius-sm` | `4px` | Small border radius |
| `--radius-md` | `8px` | Medium border radius |
| `--radius-lg` | `16px` | Large border radius |
| `--border-subtle` | Color value | Subtle borders |
| `--border-prominent` | Color value | Prominent borders |
| `--border-input` | Color value | Input field borders |
| `--transition-speed` | `0.15s` | Animation duration |
| `--transition-fn` | `ease` | Animation timing function |
| `--button-shadow` | `none` | Button shadow |
| `--input-shadow` | `none` | Input shadow |

## Typography

Set at the `:root` level (not theme-specific):

| Variable | Default | Description |
|----------|---------|-------------|
| `--font-display` | `'Space Grotesk', sans-serif` | Headings and display text |
| `--font-body` | `'DM Sans', sans-serif` | Body text |
| `--font-code` | `'Courier New', monospace` | Code blocks |

## Adding a Built-in Theme

1. Choose a unique ID (lowercase, alphanumeric)
2. Add to `THEMES` array in `client/src/components/SettingsModal.js`
3. Add CSS variables in `client/src/index.css` under `[data-theme="your-id"]`
4. Test with `npm run build` from `client/`

## Related

- [Themes](themes.md) — Built-in themes
- [Custom Themes](custom-themes.md) — Theme creator
