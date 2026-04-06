# Themes

Nexus includes 12 built-in themes and supports custom themes.

## Switching Themes

1. Open **Settings** (gear icon)
2. Go to the **Appearance** section
3. Click a theme to apply it

The selected theme is stored in localStorage (`nexus_theme`) and synced to the server via `user:settings-update`.

## Built-in Themes

Nexus ships with 12 built-in themes. Each theme card shows a 4-color swatch preview.

## How Themes Work

Themes are implemented as CSS custom properties (variables) applied via a `data-theme` attribute on the root HTML element:

```css
[data-theme="midnight"] {
  --bg-primary: #1a1c1f;
  --bg-secondary: #141618;
  --text-normal: #dcddde;
  /* ... 50+ variables */
}
```

Built-in themes are defined in `client/src/index.css`.

## Related

- [Custom Themes](custom-themes.md) — Create your own themes
- [Theme Import/Export](theme-import-export.md) — Share themes
- [CSS Variable Reference](css-variable-reference.md) — All theme variables
