#!/usr/bin/env tsx
/**
 * Demo script to showcase enhanced UI features
 * Run with: npm run dev demo-ui.ts
 */

import {
  createTitleBox,
  createInfoBox,
  displayMetricBar,
  displayStatus,
  divider,
  formatGraphTree,
  displayCompactList,
  typewriter,
} from './src/utils/formatter';

async function demo() {
  console.clear();

  // Demo 1: Title Box
  console.log(createTitleBox('DEPOSIUM CLI', 'Enhanced UI Demo'));

  await sleep(1000);

  // Demo 2: Info Boxes
  console.log(createInfoBox('Success', 'All systems operational!', 'success'));
  await sleep(500);

  console.log(createInfoBox('Warning', 'API rate limit approaching', 'warning'));
  await sleep(500);

  console.log(createInfoBox('Info', 'New features available in v2.0', 'info'));
  await sleep(500);

  // Demo 3: Dividers
  console.log('\n' + divider('Status Indicators', 'heavy') + '\n');
  await sleep(500);

  // Demo 4: Status Display
  displayStatus('Database', 'online');
  displayStatus('API Server', 'online');
  displayStatus('Cache', 'degraded');
  displayStatus('Worker Queue', 'offline');

  await sleep(1000);

  // Demo 5: Metric Bars
  console.log('\n' + divider('Performance Metrics', 'light') + '\n');
  displayMetricBar('CPU Usage', 45, 100, '%');
  displayMetricBar('Memory', 6.5, 16, 'GB');
  displayMetricBar('Disk Space', 250, 500, 'GB');
  displayMetricBar('API Calls', 8500, 10000, ' requests');

  await sleep(1000);

  // Demo 6: Graph Tree Visualization
  const nodes = [
    { id: 'root', name: 'Application', type: 'service' },
    { id: 'api', name: 'API Gateway', type: 'service' },
    { id: 'db', name: 'Database', type: 'storage' },
    { id: 'cache', name: 'Redis Cache', type: 'storage' },
    { id: 'worker', name: 'Background Worker', type: 'service' },
    { id: 'queue', name: 'Message Queue', type: 'infrastructure' },
  ];

  const edges = [
    { source: 'root', target: 'api' },
    { source: 'root', target: 'worker' },
    { source: 'api', target: 'db' },
    { source: 'api', target: 'cache' },
    { source: 'worker', target: 'queue' },
    { source: 'worker', target: 'db' },
  ];

  formatGraphTree(nodes, edges);

  await sleep(1000);

  // Demo 7: Compact List
  displayCompactList(
    '📦 Available Packages',
    ['@deposium/cli v1.0.0', '@deposium/mcp-server v2.1.0', '@deposium/sdk v1.5.2'],
    '📦'
  );

  await sleep(1000);

  // Demo 8: Typewriter Effect
  console.log('\n' + divider('Streaming Text Demo', 'double') + '\n');
  await typewriter('✨ This is a typewriter effect... Perfect for AI responses!', 30);

  await sleep(500);

  // Final message
  console.log('\n' + divider('Demo Complete', 'heavy') + '\n');
  console.log(createInfoBox('Thank You!', 'The enhanced UI makes CLI interactions more visual and engaging.', 'success'));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run demo
demo().catch(console.error);
