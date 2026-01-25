# Deposium CLI - UI Enhancements

## Overview

The Deposium CLI has been enhanced with modern, visually appealing UI components while maintaining its command-line nature. These enhancements make the CLI more user-friendly, easier to read, and more engaging.

## 🎨 New Features

### 1. **Title Boxes with Gradient Text**

Beautiful gradient-colored title boxes for major sections and modes.

```typescript
createTitleBox('TITLE', 'subtitle');
```

**Example:**

```
╭─────────────────────────────╮
│                             │
│   DEPOSIUM CLI              │
│   Interactive Mode          │
│                             │
╰─────────────────────────────╯
```

### 2. **Info Boxes**

Contextual information boxes with different styles for various message types.

```typescript
createInfoBox('Title', 'Content', 'success' | 'info' | 'warning' | 'error');
```

**Types:**

- ✅ Success (green border)
- ℹ️ Info (cyan border)
- ⚠️ Warning (yellow border)
- ❌ Error (red border)

### 3. **Visual Status Indicators**

Clear status indicators with colored dots and labels.

```typescript
displayStatus('Service Name', 'online' | 'offline' | 'degraded' | 'unknown');
```

**Example:**

```
● Database                  ONLINE
● API Server                ONLINE
● Cache                     DEGRADED
● Worker Queue              OFFLINE
```

### 4. **Metric Bars**

Visual progress bars for metrics and percentages.

```typescript
displayMetricBar('Label', currentValue, maxValue, 'unit');
```

**Example:**

```
CPU Usage            ██████████████░░░░░░░░░░░░░░░░ 45%/100% (45.0%)
Memory               ████████████░░░░░░░░░░░░░░░░░░ 6.5GB/16GB (40.6%)
```

**Color Coding:**

- 🟢 Green: ≥70%
- 🟡 Yellow: 40-69%
- 🔴 Red: <40%

### 5. **Tree Visualization for Graphs**

ASCII tree structure for displaying graph relationships.

```typescript
formatGraphTree(nodes, edges);
```

**Example:**

```
🌳 Graph Structure

└── Application (service)
    ├── API Gateway (service)
    │   ├── Database (storage)
    │   └── Redis Cache (storage)
    └── Background Worker (service)
        ├── Message Queue (infrastructure)
        └── Database (storage)
```

### 6. **Dividers**

Styled horizontal dividers with optional labels.

```typescript
divider('Label', 'light' | 'heavy' | 'double');
```

**Styles:**

- `light`: ─────────
- `heavy`: ━━━━━━━━━
- `double`: ═════════

### 7. **Typewriter Effect**

Streaming text effect for AI responses (can be adjusted for speed).

```typescript
await typewriter('Your text here', speed);
```

### 8. **Compact Lists**

Clean, hierarchical list display with icons.

```typescript
displayCompactList('Title', items, 'icon');
```

**Example:**

```
📦 Available Packages

├─ 📦 @deposium/cli v1.0.0
├─ 📦 @deposium/mcp-server v2.1.0
└─ 📦 @deposium/sdk v1.5.2
```

## 📦 New Dependencies

The following packages were added to support the enhanced UI:

```json
{
  "boxen": "^8.0.1", // Boxes around content
  "gradient-string": "^3.0.0" // Gradient text colors
}
```

## 🎯 Enhanced Commands

### Health Check (`deposium health`)

- **Before:** Simple text list of services
- **After:**
  - Gradient title box
  - Status info box
  - Visual status indicators with colored dots
  - System health metric bar
  - Clean dividers between sections

### Interactive Mode (`deposium interactive` or `deposium i`)

- **Before:** Simple list menu
- **After:**
  - Gradient title box
  - Grouped menu with visual separators
  - Category labels (AI Operations, Data Operations, System)
  - Gray descriptions for each option
  - Colored exit option

### Chat Mode (`deposium chat`)

- **Before:** Basic conversation flow
- **After:**
  - Gradient title box
  - Labeled dividers for AI responses
  - Enhanced exchange counter
  - Better visual separation

### Compound AI Output

- **Before:** Plain table with metadata
- **After:**
  - Gradient ASCII art logo
  - Status info box
  - Answer in subtle boxed format
  - Visual confidence metric bar
  - Clean metadata display with emojis
  - Labeled dividers

## 🚀 Usage Examples

### Example 1: Enhanced Health Check

```bash
deposium health
```

Output includes:

- Gradient title "HEALTH CHECK"
- Success box with connection info
- Visual status indicators for all services
- System health metric bar showing X/Y services online

### Example 2: Interactive Mode

```bash
deposium i
```

Features:

- Gradient title "INTERACTIVE MODE"
- Grouped menu with categories
- Visual separators between sections
- Descriptive text for each option

### Example 3: AI Chat

```bash
deposium chat
```

Improvements:

- Gradient title on startup
- Dividers between AI responses
- Exchange counter with emoji
- Better visual flow

## 🎨 Color Scheme

The CLI uses a consistent color palette:

- **Cyan**: Headers, titles, important labels
- **Green**: Success states, online status
- **Yellow**: Warnings, degraded status
- **Red**: Errors, offline status
- **Gray**: Secondary info, descriptions
- **Gradient**: Special elements (titles, logos)

## 📊 Performance Impact

The UI enhancements have minimal performance impact:

- ✅ No additional API calls
- ✅ Negligible rendering overhead
- ✅ All visual elements are terminal-native
- ✅ No external dependencies on system fonts

## 🔧 Customization

All UI utilities are exported from `src/utils/formatter.ts` and can be used throughout the application:

```typescript
import {
  createTitleBox,
  createInfoBox,
  displayMetricBar,
  displayStatus,
  divider,
  formatGraphTree,
  displayCompactList,
  typewriter,
} from './utils/formatter';
```

## 🧪 Testing

Run the demo script to see all UI features in action:

```bash
npx tsx demo-ui.ts
```

This will showcase:

1. Title boxes
2. Info boxes (all types)
3. Status indicators
4. Metric bars
5. Graph tree visualization
6. Compact lists
7. Typewriter effect
8. Dividers

## 📝 Development Notes

### Adding New UI Elements

1. Add utility function to `src/utils/formatter.ts`
2. Export the function
3. Import where needed
4. Follow existing color scheme and style patterns

### Best Practices

- Use `divider()` to separate major sections
- Use `createInfoBox()` for important messages
- Use `displayStatus()` for service/resource states
- Use `displayMetricBar()` for any percentage or ratio
- Use `createTitleBox()` for major mode/feature headers
- Use consistent emoji icons throughout

## 🎯 Future Enhancements

Potential future improvements:

- [ ] Animated loading states
- [ ] Table pagination for large datasets
- [ ] Interactive graph exploration
- [ ] Customizable color themes
- [ ] Configuration file for UI preferences
- [ ] More ASCII chart types (pie, line graphs)

## 📚 Related Files

- `src/utils/formatter.ts` - Main UI utility functions
- `src/commands/health.ts` - Enhanced health check
- `src/interactive.ts` - Enhanced interactive mode
- `src/chat.ts` - Enhanced chat mode
- `demo-ui.ts` - Comprehensive demo script
- `package.json` - New UI dependencies

---

**Note:** All enhancements maintain backward compatibility. The CLI remains fully functional in terminals without color support (falls back gracefully).

---

# UI Enhancement - Quick Reference

## 🚀 Quick Import

```typescript
import {
  createTitleBox,
  createInfoBox,
  displayMetricBar,
  displayStatus,
  divider,
  formatGraphTree,
  displayCompactList,
  typewriter,
} from './utils/formatter';
```

## 📦 Functions at a Glance

### 1. Title Box

```typescript
createTitleBox('TITLE', 'subtitle?');
```

**Returns:** String with boxed gradient title

### 2. Info Box

```typescript
createInfoBox('Title', 'content', 'success' | 'info' | 'warning' | 'error');
```

**Returns:** String with styled info box

### 3. Metric Bar

```typescript
displayMetricBar('Label', currentValue, maxValue, 'unit?');
```

**Output:** Visual progress bar with percentage

### 4. Status Indicator

```typescript
displayStatus('Service', 'online' | 'offline' | 'degraded' | 'unknown');
```

**Output:** Colored dot with status label

### 5. Divider

```typescript
divider('Label?', 'light' | 'heavy' | 'double');
```

**Returns:** Styled horizontal line

### 6. Graph Tree

```typescript
formatGraphTree(nodes: any[], edges: any[])
```

**Output:** ASCII tree structure

### 7. Compact List

```typescript
displayCompactList('Title', items: string[], 'icon?')
```

**Output:** Hierarchical list with icons

### 8. Typewriter Effect

```typescript
await typewriter('text', speed?)
```

**Output:** Character-by-character streaming

## 🎨 Color Scheme

| Color    | Usage                              |
| -------- | ---------------------------------- |
| Cyan     | Headers, titles, labels            |
| Green    | Success, online, high (≥70%)       |
| Yellow   | Warning, degraded, medium (40-69%) |
| Red      | Error, offline, low (<40%)         |
| Gray     | Secondary info, hints              |
| Gradient | Special elements (titles, logos)   |

## 📊 Common Patterns

### Status Dashboard

```typescript
console.log(createTitleBox('HEALTH CHECK', 'System Status'));
console.log(createInfoBox('Server', 'Connected', 'success'));
console.log(divider('Services', 'light'));
displayStatus('Database', 'online');
displayStatus('API', 'online');
displayMetricBar('Uptime', 99.5, 100, '%');
```

### Data Display

```typescript
console.log(divider('Results', 'heavy'));
formatGraphTree(nodes, edges);
displayCompactList('Items', ['item1', 'item2'], '📄');
```

## ⚡ Quick Tips

- Use `createTitleBox()` at the start of major sections
- Use `divider()` to separate content logically
- Use `displayStatus()` for any on/off state
- Use `displayMetricBar()` for percentages or ratios
- Use `createInfoBox()` for important messages
- Use `typewriter()` for dramatic reveals
- Colors auto-adjust based on percentage (metric bars)
- All functions handle undefined/null gracefully

## 🎯 File Locations

| Component            | File Path                 |
| -------------------- | ------------------------- |
| UI Utilities         | `/src/utils/formatter.ts` |
| Enhanced Health      | `/src/commands/health.ts` |
| Enhanced Interactive | `/src/interactive.ts`     |
| Enhanced Chat        | `/src/chat.ts`            |
| Demo Script          | `/demo-ui.ts`             |

## 📝 Examples

See `demo-ui.ts` for comprehensive examples of all UI features in action.

Run: `npx tsx demo-ui.ts`
