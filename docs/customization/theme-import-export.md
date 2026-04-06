# Theme Import/Export

Share custom themes with other Nexus users.

## Export Format

Themes export as `.nexus-theme.json` files:

```json
{
  "nexus_theme": true,
  "version": 1,
  "name": "My Theme",
  "description": "A cool dark theme",
  "colors": {
    "bgPrimary": "#1a1c1f",
    "bgSecondary": "#141618",
    "bgFloating": "#18191c",
    "textPrimary": "#dcddde",
    "textSecondary": "#72767d",
    "textLink": "#00b0f4",
    "accent": "#3B82F6",
    "success": "#57f287",
    "warning": "#faa61a",
    "danger": "#ed4245"
  }
}
```

## Exporting a Theme

Click the **Export** button on a custom theme card. The `.nexus-theme.json` file downloads automatically.

## Importing a Theme

1. Go to **Settings → Appearance**
2. Click **Import Theme**
3. Select a `.nexus-theme.json` file

The imported theme appears in your custom themes list.

## Related

- [Custom Themes](custom-themes.md) — Creating themes
- [CSS Variable Reference](css-variable-reference.md) — All theme variables
