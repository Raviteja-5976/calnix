# Calnix — Design System

> **Design philosophy:** Quietly distinctive.  
> **Brand statement:** Less noise. More time.  
> **Design language:** Editorial Minimalism × Soft Brutalism × Swiss Grid.

---

## 1. Design Philosophy

Calnix should feel like a thoughtfully crafted productivity product, not another generic SaaS dashboard.

The interface must balance personality with usability. It should be visually distinctive without becoming distracting, minimal without feeling empty, and sophisticated without becoming difficult to understand.

### Core principles

1. **Clarity over decoration** — Every visual element must have a purpose.
2. **Minimalism with personality** — Avoid generic templates and predictable SaaS aesthetics.
3. **Visual hierarchy** — Important information should be immediately recognizable.
4. **Consistency** — Components should follow a unified visual language.
5. **Calm interfaces** — Avoid unnecessary visual noise, excessive colors and competing elements.
6. **Functional beauty** — Interactions should feel natural and intuitive.
7. **Timelessness** — Prefer enduring design decisions over temporary visual trends.

### Design personality

- Calm, not boring.
- Modern, not futuristic.
- Minimal, not empty.
- Premium, not luxurious.
- Distinctive, not experimental.
- Approachable, not childish.

---

## 2. Design Language

Calnix combines three design philosophies.

### 2.1 Editorial Minimalism

Inspired by contemporary editorial publications and Swiss graphic design.

Characteristics:
- Strong typography.
- Intentional whitespace.
- Clear visual hierarchy.
- Restrained color usage.
- Precise alignment.
- Typography-driven visual identity.

### 2.2 Soft Brutalism

A restrained interpretation of Neo-Brutalism.

Characteristics:
- Defined borders.
- Strong contrast.
- Geometric shapes.
- Subtle offset shadows used selectively.
- Confident typography.
- Minimal decorative effects.

Avoid excessive thick borders, aggressive shadows and unnecessarily harsh contrasts.

### 2.3 Swiss Grid Design

Use structured spacing, consistent alignment and predictable visual relationships.

Characteristics:
- Consistent spacing systems.
- Structured alignment.
- Balanced proportions.
- Logical grouping.
- Clear information hierarchy.
- Functional consistency.

The combination should create an interface that feels organized, recognizable and comfortable to use.

---

## 3. Brand Color Palette

Calnix uses a warm, paper-inspired neutral palette with a distinctive citron-green accent.

The color system should establish a recognizable brand identity without overwhelming the interface.

### 3.1 Primary Colors

| Token | Hex | Purpose |
|---|---|---|
| Paper | #F4F1E9 | Primary background |
| Ivory | #FFFEFA | Primary surfaces |
| Carbon | #20221F | Primary text |
| Citron | #A9C957 | Brand accent |
| Stone | #DCD9CF | Borders and dividers |
| Ash | #77796F | Secondary text |

### 3.2 Supporting Colors

| Token | Hex | Purpose |
|---|---|---|
| Soft White | #FFFFFF | Elevated surfaces |
| Deep Carbon | #171915 | Strong emphasis |
| Muted Stone | #BEBBAF | Stronger borders |
| Pale Citron | #EAF1D8 | Subtle brand backgrounds |
| Dark Citron | #758F3B | Accent hover states |

### 3.3 Functional Colors

Functional colors communicate meaning and status. They must remain visually distinct from the brand accent.

| Purpose | Color | Hex |
|---|---|---|
| Success | Sage | #8BAA8B |
| Warning | Mustard | #C7A653 |
| Error | Terracotta | #C97968 |
| Information | Dusty Blue | #829DB8 |
| Neutral | Ash | #77796F |

### 3.4 Calendar Semantic Colors

Use muted backgrounds with readable foreground text.

| Category | Background | Foreground |
|---|---|---|
| Personal | #F4E3DC | #704538 |
| Work | #E5EDE2 | #38533B |
| Meetings | #E3EAF0 | #3D536B |
| Reminders | #ECE8F3 | #584C75 |
| Important | #F1EBD9 | #69572E |

These colors should be configurable and extensible.

### 3.5 Color Usage Guidelines

- Paper should be the dominant application background.
- Ivory should be used for primary surfaces.
- Carbon should be the primary text color.
- Citron should be reserved for important brand interactions and highlights.
- Stone should define subtle boundaries.
- Functional colors should communicate meaning, not decoration.
- Avoid using multiple strong accent colors in the same visual context.
- Avoid excessive gradients.
- Maintain sufficient contrast between text and backgrounds.

The brand accent should be recognizable through restraint, not frequency.

---

## 4. Dark Mode

Dark mode should feel like a deliberately designed alternative, not an inverted light theme.

Use warm charcoal surfaces rather than pure black.

| Token | Hex | Purpose |
|---|---|---|
| Background | #20221F | Main background |
| Surface | #292B27 | Primary surfaces |
| Elevated | #32342F | Elevated surfaces |
| Foreground | #F4F1E9 | Primary text |
| Muted Foreground | #AAA99E | Secondary text |
| Border | #44463F | Borders |
| Brand Accent | #B7D76B | Brand highlights |

### Dark Mode Guidelines

- Preserve the warm character of the light theme.
- Avoid pure black backgrounds.
- Avoid excessively bright text.
- Maintain clear surface differentiation.
- Use the same semantic meaning for colors across themes.
- Ensure event colors remain readable.
- Avoid excessive glowing effects.

Light and dark themes must share the same design identity.

---

## 5. Typography System

Typography is a major part of the Calnix visual identity.

Use a combination of geometric display typography, neutral interface typography and monospaced numerical typography.

### Font Families

| Purpose | Font | Usage |
|---|---|---|
| Display | Space Grotesk | Branding and headings |
| Interface | Inter | General interface text |
| Data | Geist Mono | Time, dates and numerical information |

### Typography Characteristics

**Space Grotesk**
- Distinctive geometric appearance.
- Confident headings.
- Strong brand personality.
- Use selectively.

**Inter**
- Highly readable.
- Neutral and functional.
- Suitable for interface elements.
- Consistent across different screen sizes.

**Geist Mono**
- Monospaced numerical presentation.
- Useful for timestamps and durations.
- Helps create a technical visual identity.

### Typography Guidelines

- Use a limited number of font weights.
- Prefer Regular, Medium and Semibold.
- Maintain consistent line heights.
- Avoid unnecessary uppercase text.
- Use monospaced typography only where it improves readability.
- Maintain a clear hierarchy between headings, labels and descriptions.
- Avoid oversized typography without a functional reason.

---

## 6. Spacing System

Use a consistent 4px-based spacing scale.

| Token | Value |
|---|---:|
| 2XS | 2px |
| XS | 4px |
| SM | 8px |
| MD | 12px |
| LG | 16px |
| XL | 24px |
| 2XL | 32px |
| 3XL | 48px |
| 4XL | 64px |

### Spacing Principles

- Maintain consistent spacing between related elements.
- Use larger spacing to distinguish unrelated content.
- Avoid unnecessarily compressed interfaces.
- Avoid excessive whitespace that reduces information density.
- Use spacing to establish visual hierarchy.
- Keep component padding consistent.

---

## 7. Border Radius and Shape Language

Calnix should use moderately rounded geometric shapes.

Avoid both extremely sharp interfaces and excessively rounded, playful interfaces.

| Token | Value | Usage |
|---|---:|---|
| Small | 4px | Tags and small indicators |
| Control | 6px | Buttons and inputs |
| Card | 8px | Cards and interactive elements |
| Panel | 12px | Larger surfaces |
| Dialog | 16px | Dialogs and overlays |
| Full | 9999px | Circular indicators and selected pills |

### Shape Guidelines

- Prefer consistent corner radii.
- Avoid random radius variations.
- Reserve fully rounded shapes for specific purposes.
- Use geometry to create visual consistency.
- Prefer simple shapes over decorative illustrations.

---

## 8. Borders and Shadows

Borders should be the primary method of establishing visual separation.

### Border Tokens

| Token | Value |
|---|---|
| Default | 1px solid #DCD9CF |
| Strong | 1px solid #BEBBAF |
| Focus | 2px solid #A9C957 |

### Shadow Philosophy

Shadows should be subtle and functional.

Recommended:
- Minimal elevation for interactive surfaces.
- Subtle shadows for popovers and dialogs.
- Small offset shadows for selected brand elements.

Avoid:
- Large diffuse shadows.
- Multiple shadow layers.
- Heavy card shadows.
- Shadows used to compensate for poor visual hierarchy.

---

## 9. Component Design Principles

All components must follow the same visual language.

### Buttons
- Clear labels and recognizable actions.
- Consistent sizing.
- Carbon primary buttons.
- Citron reserved for important brand actions.
- Subtle hover and pressed states.
- Visible keyboard focus.

### Inputs
- Neutral surfaces.
- Defined borders.
- Clear labels.
- Consistent heights.
- Predictable focus states.
- Accessible validation messages.

### Cards
- Minimal decoration.
- Subtle borders.
- Consistent spacing.
- Clear information hierarchy.
- Shadows only when elevation is necessary.

### Icons
- Prefer Lucide icons.
- Use consistent stroke weights.
- Avoid mixing unrelated icon styles.
- Icons must communicate recognizable actions.
- Use labels when icon meaning may be ambiguous.

### Dialogs and Overlays
- Clear separation from the underlying interface.
- Focused content.
- Predictable close behavior.
- Minimal decoration.
- Accessible keyboard interactions.

### States

Every interactive component should support:

- Default
- Hover
- Focus
- Active
- Selected
- Disabled
- Loading
- Error
- Success

---

## 10. Motion and Interaction

Animations should improve feedback and perceived responsiveness.

### Motion Principles

- Keep animations short.
- Prefer subtle transitions.
- Avoid unnecessary movement.
- Respect reduced-motion preferences.
- Avoid animations that interfere with productivity.

### Recommended Durations

| Interaction | Duration |
|---|---:|
| Hover | 120ms |
| Button feedback | 120ms |
| Small transitions | 160ms |
| Dialog transitions | 200ms |
| Larger transitions | 240ms |

### Easing

Use natural ease-out transitions for elements entering the interface and ease-in transitions for elements leaving it.

Avoid excessive bouncing, spring animations and dramatic transitions.

---

## 11. Accessibility

Accessibility is a fundamental design requirement.

- Maintain WCAG 2.2 AA contrast targets.
- Never communicate important information using color alone.
- Provide keyboard accessibility.
- Use visible focus indicators.
- Support screen readers.
- Provide descriptive labels.
- Ensure interactive elements have appropriate touch targets.
- Respect reduced-motion settings.
- Maintain readable typography.
- Ensure light and dark themes are both accessible.

---

## 12. Responsive Design Philosophy

The design system must work across desktop, tablet and mobile devices.

- Maintain consistent typography and color usage.
- Preserve visual hierarchy across screen sizes.
- Avoid excessive content density on smaller screens.
- Prioritize essential information.
- Ensure interactive elements remain comfortable to use.
- Adapt spacing based on available screen space.
- Avoid simply shrinking desktop interfaces to fit mobile screens.

---

## 13. Design Anti-Patterns

The following should be avoided unless there is a strong functional justification.

- Generic purple SaaS branding.
- Excessive gradients.
- Glassmorphism everywhere.
- Excessive rounded cards.
- Too many floating elements.
- Excessive use of shadows.
- Unnecessary animations.
- Overly colorful interfaces.
- Decorative charts without meaningful information.
- Inconsistent spacing.
- Unnecessary borders.
- Too many competing typography styles.
- Excessive visual hierarchy levels.
- Unnecessary visual complexity.
- Copying the visual identity of existing calendar products.

---

## 14. Implementation Guidelines

The design system should be implemented using reusable design tokens and shared components.

Recommended foundations:

- CSS custom properties for design tokens.
- Tailwind CSS for utility-based styling.
- shadcn/ui for accessible component foundations.
- Lucide for icons.
- Space Grotesk, Inter and Geist Mono for typography.

### Implementation Requirements

1. Centralize colors, typography, spacing and radius values.
2. Support light and dark themes using semantic tokens.
3. Avoid hardcoding colors throughout individual components.
4. Build reusable component primitives.
5. Maintain consistent interaction states.
6. Keep design tokens independent from specific features.
7. Ensure accessibility is considered during implementation.
8. Avoid introducing new colors without updating the design system.
9. Keep the system extensible for future product capabilities.
10. Maintain a consistent visual identity across the entire application.

---

## 15. Final Design Direction

Calnix should be recognizable through its combination of:

- Warm paper-inspired surfaces.
- Carbon typography.
- Distinctive citron-green accents.
- Editorial typography.
- Structured Swiss-inspired alignment.
- Restrained soft-brutalist details.
- Muted functional colors.
- Subtle interactions.
- Minimal visual noise.

**The ultimate design principle:**

> Calnix should make complexity feel simple. It should have enough personality to be remembered, but enough restraint to be used every day.

Every design decision should reinforce this principle.