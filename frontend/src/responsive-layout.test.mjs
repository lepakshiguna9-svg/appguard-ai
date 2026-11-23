import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

function rulesFor(width) {
  const marker = `@media(max-width:${width}px)`;
  const blocks = [];
  let from = 0;
  while (true) {
    const index = css.indexOf(marker, from);
    if (index < 0) break;
    const open = css.indexOf('{', index);
    let depth = 0;
    let end = open;
    for (; end < css.length; end += 1) {
      if (css[end] === '{') depth += 1;
      if (css[end] === '}' && --depth === 0) break;
    }
    blocks.push(css.slice(open + 1, end));
    from = end + 1;
  }
  return blocks.join('\n');
}

test('work area and selected record panel adapt below tablet width', () => {
  const tablet = rulesFor(850);
  assert.ok(tablet.includes('.work-area{grid-template-columns:1fr}'));
  assert.ok(tablet.includes('.detail-panel{position:static}'));
});

test('narrow screens replace the wide table and reflow detail and flag controls', () => {
  const phone = rulesFor(560);
  const narrowTablet = rulesFor(620);
  assert.ok(phone.includes('.table-scroll{display:none}'));
  assert.ok(phone.includes('.mobile-records{display:grid;gap:'));
  assert.ok(phone.includes('.field-grid{grid-template-columns:1fr}'));
  assert.ok(narrowTablet.includes('.flag-analytics{grid-template-columns:repeat(2,minmax(0,1fr))}'));
});
