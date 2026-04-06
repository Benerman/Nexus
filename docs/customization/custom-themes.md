# Custom Themes

Create your own Nexus themes with the built-in theme creator.

## Creating a Theme

1. Open **Settings → Appearance**
2. Click **Create Theme**
3. Configure your 10 base colors:

### Color Groups

| Group | Colors | Purpose |
|-------|--------|---------|
| **Backgrounds** | `bgPrimary`, `bgSecondary`, `bgFloating` | Main UI surfaces |
| **Text** | `textPrimary`, `textSecondary`, `textLink` | Text colors |
| **Accent** | `accent` | Buttons, selections, brand color |
| **Status** | `success`, `warning`, `danger` | Status indicators |

4. Set a theme name and optional description
5. Click **Save**

## Color Derivation

From your 10 base colors, Nexus automatically derives 50+ CSS variables:

| Derived Variable | Source |
|-----------------|--------|
| `--bg-tertiary` | bgPrimary ±15% brightness (dark) or ±8% (light) |
| `--brand-600` | accent -15% brightness |
| `--bg-modifier-hover` | rgba(255,255,255,0.06) for dark themes |
| `--bg-modifier-active` | rgba(255,255,255,0.1) for dark themes |
| `--header-primary` | #ffffff (dark) or #000000 (light) |

Light vs dark detection is based on the relative luminance of `bgPrimary` (threshold: 0.2).

## Live Preview

Changes preview in real-time as you adjust colors.

## Storage

Custom themes are stored in localStorage (`nexus_custom_themes`) as a JSON array. Each theme includes:

```json
{
  "id": "unique-id",
  "name": "My Theme",
  "description": "Optional description",
  "colors": { /* 10 base colors */ },
  "css": "/* pre-generated CSS rule set */",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

At startup, `injectCustomThemeStyles()` injects custom theme CSS into the DOM.

## Editing a Theme

Click the **Edit** button on a custom theme card to modify its colors, name, or description.

## Deleting a Theme

Click the **Delete** button on a custom theme card to remove it.

## Related

- [Themes](themes.md) — Built-in themes
- [Theme Import/Export](theme-import-export.md) — Share themes
- [CSS Variable Reference](css-variable-reference.md) — All theme variables
