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
