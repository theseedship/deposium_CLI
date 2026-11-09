#!/usr/bin/env tsx
/**
 * Demo script to showcase enhanced UI features
 * Run from the CLI checkout with: npm run demo:ui
 * Synthetic fixtures only: no account, model or server calls.
 */

import {
  createTitleBox,
  createInfoBox,
  displayMetricBar,
  displayStatus,
  divider,
  formatOutput,
} from './src/utils/formatter';
import { createWelcomeBanner } from './src/utils/branding';

function demo() {
  console.clear();

  // Demo 1: Title Box
  console.log(createWelcomeBanner());
  console.log(createTitleBox('UI DEMO', 'Synthetic data · No server calls'));

  // Demo 2: Info Boxes
  console.log(createInfoBox('Success', 'Example success message (synthetic).', 'success'));

  console.log(createInfoBox('Warning', 'API rate limit approaching', 'warning'));

  console.log(createInfoBox('Info', 'Example informational message (synthetic).', 'info'));

  // Demo 3: Dividers
  console.log('\n' + divider('Simulated Status Indicators', 'heavy') + '\n');

  // Demo 4: Status Display
  displayStatus('Database', 'online');
  displayStatus('API Server', 'online');
  displayStatus('Cache', 'degraded');
  displayStatus('Worker Queue', 'offline');

  // Demo 5: Metric Bars
  console.log('\n' + divider('Synthetic Metric Examples', 'light') + '\n');
  displayMetricBar('CPU Usage', 45, 100, '%');
  displayMetricBar('Memory', 6.5, 16, 'GB');
  displayMetricBar('Disk Space', 250, 500, 'GB');
  displayMetricBar('API Calls', 8500, 10000, ' requests');

  // Demo 6: Render actual result helpers with explicit synthetic fixtures.
  console.log('\n' + divider('Synthetic Result Examples', 'light') + '\n');
  formatOutput([
    { name: 'Example document A', pages: 3 },
    { name: 'Example document B', pages: 8 },
  ]);
  formatOutput(
    '## Markdown example\n\nA **synthetic** answer with a short list:\n\n- First item\n- Second item',
    'markdown'
  );

  // Final message
  console.log('\n' + divider('Demo Complete', 'heavy') + '\n');
  console.log(
    createInfoBox(
      'Thank You!',
      'The enhanced UI makes CLI interactions more visual and engaging.',
      'success'
    )
  );
}

try {
  demo();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
