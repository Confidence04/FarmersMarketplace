# Design Tokens & Theming

This directory contains centralized design tokens and theme-related stylesheets that replace scattered inline styles throughout the application.

## `tokens.css` - Design Token System

A comprehensive CSS custom properties (variables) system for colors, spacing, typography, and shadows. Supports light and dark themes that automatically switch based on `html[data-theme]` attribute.

### Theme Switching

The theme system is integrated with React's `ThemeContext`. The `ThemeProvider` automatically sets `document.documentElement.dataset.theme` which activates the appropriate CSS variable values.

**Available themes:**
- `light` (default)
- `dark`
- System preference (automatic)

### Color Tokens

#### Primary Colors
```css
--color-primary: Main brand color (#2d6a4f light, #40916c dark)
--color-primary-light: Lighter variant
--color-primary-lighter: Even lighter variant
--color-primary-lightest: Very light variant for backgrounds
```

#### Secondary & Accent
```css
--color-secondary: Secondary brand color
--color-secondary-light: Secondary variant
--color-accent: Accent/warning color (#e67e22 light, #ffb74d dark)
--color-accent-light: Accent light variant
```

#### Error & Warning States
```css
--color-error: Error red (#c0392b light, #ef5350 dark)
--color-error-light: Lighter error variant
--color-error-lightest: Very light error background
--color-warning: Warning orange
--color-warning-light: Light warning variant
--color-warning-lightest: Very light warning background
--color-success: Success green
```

#### Background & Text
```css
--color-bg-primary: Main background (#fff light, #1e1e1e dark)
--color-bg-secondary: Secondary background (#f8fdf9 light, #2d2d2d dark)
--color-bg-tertiary: Tertiary background (#f0f0f0 light, #3f3f3f dark)
--color-bg-overlay: Semi-transparent overlay

--color-text-primary: Main text color (#333 light, #f5f5f5 dark)
--color-text-secondary: Secondary text (#555 light, #ccc dark)
--color-text-tertiary: Tertiary text (#888 light, #999 dark)
--color-text-inverse: Inverse text for overlays (#fff light, #1e1e1e dark)

--color-border: Standard border (#ddd light, #444 dark)
--color-border-light: Light border (#f1f1f1 light, #5a5a5a dark)
--color-border-accent: Accent border (#b7e4c7 light, #2d5a42 dark)
```

### Spacing Scale

Consistent spacing based on 4px base unit:
```css
--spacing-xs: 4px
--spacing-sm: 8px
--spacing-md: 12px
--spacing-lg: 16px
--spacing-xl: 20px
--spacing-2xl: 24px
--spacing-3xl: 28px
--spacing-4xl: 32px
```

### Border Radius Scale

```css
--radius-sm: 4px        /* Small elements */
--radius-md: 6px        /* Medium elements */
--radius-lg: 8px        /* Inputs, buttons, cards (default) */
--radius-xl: 12px       /* Large containers */
--radius-2xl: 24px      /* Very large containers */
--radius-full: 9999px   /* Fully rounded (pills, avatars) */
```

### Typography Tokens

**Font Family:**
```css
--font-family-base: System font stack
```

**Font Sizes:**
```css
--font-size-xs: 12px    /* Help text, captions */
--font-size-sm: 13px    /* Labels, small text */
--font-size-base: 14px  /* Body text default */
--font-size-lg: 16px    /* Input, button default */
--font-size-xl: 17px    /* Section headings */
--font-size-2xl: 20px   /* Page subheadings */
--font-size-3xl: 24px   /* Page titles */
```

**Font Weights:**
```css
--font-weight-normal: 400
--font-weight-medium: 600   /* Buttons, labels */
--font-weight-bold: 700     /* Headings */
```

**Line Heights:**
```css
--line-height-tight: 1.2      /* Headings */
--line-height-normal: 1.4     /* Body text default */
--line-height-relaxed: 1.6    /* Long-form content */
```

### Shadow System

Consistent shadow scale for depth:
```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05)     /* Subtle */
--shadow-md: 0 1px 8px rgba(0,0,0,0.06)     /* Default card shadow */
--shadow-lg: 0 4px 24px rgba(0,0,0,0.06)    /* Prominent elevation */
--shadow-xl: 0 10px 40px rgba(0,0,0,0.1)    /* Modal/dropdown shadow */
```

In dark theme, shadows have higher opacity for visibility.

### Component Sizing

```css
--input-height: 44px           /* Inputs, selects, textareas */
--button-height: 44px          /* Button minimum height */
--button-padding-x: 20px       /* Button horizontal padding */
--button-padding-y: 10px       /* Button vertical padding */
```

### Z-Index Scale

```css
--z-dropdown: 100
--z-sticky: 200
--z-fixed: 300
--z-modal-backdrop: 400
--z-modal: 500
--z-toast: 600
--z-tooltip: 700
```

## Usage Examples

### Using Tokens in CSS

```css
.button {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  padding: var(--button-padding-y) var(--button-padding-x);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  font-weight: var(--font-weight-medium);
  height: var(--button-height);
}

.button:hover {
  background-color: var(--color-primary-light);
  box-shadow: var(--shadow-lg);
}

.button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

### Using Tokens in React Inline Styles (Temporary)

While refactoring, temporary inline styles can use tokens:

```jsx
// ❌ Before (inline hex color)
<div style={{ color: '#2d6a4f', padding: '12px' }}>

// ✅ Better (using CSS tokens)
<div style={{ 
  color: 'var(--color-primary)', 
  padding: 'var(--spacing-md)' 
}}>

// ✅ Best (use CSS class/modules instead)
<div className={styles.heading}>
```

### Utility Classes

Pre-made utility classes for quick application of tokens:

```jsx
<div className="text-primary p-lg bg-secondary rounded shadow">
  /* Primary text, large padding, secondary background, rounded corners, shadow */
</div>
```

Available utilities:
- `.text-primary`, `.text-secondary`, `.text-tertiary`
- `.bg-primary`, `.bg-secondary`
- `.border-light`
- `.rounded`
- `.shadow`
- `.p-md`, `.p-lg`
- `.gap-md`

## Theme Integration with React

The theme switching is automatically handled by `ThemeProvider` in `src/context/ThemeContext.jsx`. No additional setup required.

To use theme in a component:
```jsx
import { useTheme } from '../context/ThemeContext';

function MyComponent() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <>
      <p>Current theme: {theme}</p>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </>
  );
}
```

## Migration Path: Replacing Inline Styles

### Phase 1: Foundation (DONE)
- ✅ Create tokens.css with comprehensive color, spacing, typography vars
- ✅ Integrate with existing ThemeContext
- ✅ Add base element styles using tokens

### Phase 2: Component Refactoring (IN PROGRESS)
- [ ] AdminDashboard: Replace 200+ inline styles with CSS classes
- [ ] ProductDetail: Replace 157 inline styles with CSS classes
- [ ] Dashboard: Replace 115+ inline styles with CSS classes
- [ ] Marketplace: Split and apply tokens
- [ ] Wallet: Replace 99 inline styles
- [ ] Orders: Replace 59 inline styles

### Phase 3: CSS Modules
- [ ] Create dashboard.module.css with component-scoped styles
- [ ] Create product-detail.module.css
- [ ] Create marketplace.module.css
- [ ] Create wallet.module.css

### Phase 4: Accessibility & Media Queries
- [ ] Add :hover, :focus-visible styles to interactive elements
- [ ] Add responsive design media queries using spacing scale
- [ ] Add prefers-reduced-motion support

## Best Practices

1. **Always use tokens over hardcoded values** - Enables consistent theming
2. **Respect the spacing scale** - Use spacing tokens for all margin/padding
3. **Use semantic color tokens** - Use `--color-error` for errors, not arbitrary reds
4. **Avoid inline styles** - Use CSS classes or CSS modules when possible
5. **Support both themes** - Test components in light and dark modes
6. **Use focus-visible** - Ensure keyboard navigation is visible
7. **Maintain contrast ratios** - WCAG AA standard minimum (4.5:1 for text)

## Dark Mode Testing

To test dark theme locally:
1. Open DevTools Console
2. Run: `document.documentElement.dataset.theme = 'dark'`
3. Or use the theme toggle in Settings/user menu

To verify visual regression:
1. Check that text is readable in both themes
2. Verify contrast ratios meet WCAG standards
3. Ensure color-coded elements are distinguishable (red/green colorblind safe)

## Related Files

- `src/context/ThemeContext.jsx` - React theme provider
- `src/styles/accessibility.css` - Accessibility-specific styles
- `src/styles/responsive.css` - Responsive design breakpoints
- `src/main.jsx` - Main entry point (imports tokens.css)
