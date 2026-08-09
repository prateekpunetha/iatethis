# Visual Design System: Obsidian Health

## Thesis
A premium, high-tech nutrition tracking experience. Deep obsidian dark mode with functional color-coding for macronutrients, glassmorphic surfaces, and a data-first dashboard layout.

## Visual Rules

### Palette & Materials
- **Background**: Deep obsidian (`#15121b`)
- **Surface Containers**: Graduated dark tones (`#0f0d15` → `#37333d`)
- **Primary**: Violet (`#d0bcff`) — energy/calories
- **Secondary**: Emerald (`#4edea3`) — protein/strength
- **Tertiary**: Amber (`#ffb95f`) — carbs/vitality
- **Error**: Coral (`#ffb4ab`) — fat tracking
- **Materials**: Glassmorphism with `backdrop-filter: blur(12px)`, 1px white/10% borders, subtle ambient shadows

### Type & Composition
- **Font**: Inter exclusively, 400–700 weights
- **Numeric emphasis**: Large display numbers (48px) for key metrics, headline-md (24px) for macro values
- **Labels**: Uppercase, 12px, 5% letter-spacing for structured scanning
- **Layout**: Mobile-first fluid grid, 20px container margins, 8px base grid

### Topology & Navigation
- Sticky top bar with app title, date, and theme toggle
- Central SVG progress ring showing remaining calories
- 2×2 macro card grid with color-coded progress bars
- Glassmorphic conversational input bar
- Structured food log card with Material icons
- Fixed bottom navigation (Daily, Log, Insights, Profile)
