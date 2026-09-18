async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const writes = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method() + ' ' + request.url()); });
  const base = 'http://127.0.0.1:4173/#/floor-planning?floor=floor-16&view=workspace';
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await page.getByRole('application').waitFor();
  assert(await page.locator('.sw-marker').count() === 19, 'Expected exactly 19 desks');
  const stateCases = [
    ['065', 'Đang sử dụng', 'Nguyễn Văn Minh'],
    ['066', 'Còn trống', 'Chưa có nhân sự được gán'],
    ['067', 'Đã đặt trước', 'Lê Hoàng Nam'],
    ['068', 'Xung đột phân công', 'Vũ Thị Lan'],
    ['069', 'Không khả dụng', 'Đang sửa ổ điện âm sàn'],
  ];
  const selectionTimes = [];
  for (const [code, label, expected] of stateCases) {
    await page.evaluate(() => {
      const map = document.querySelector('.sw-scene');
      window.__selectionPaint = null;
      map.addEventListener('pointerup', () => {
        const start = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => { window.__selectionPaint = performance.now() - start; }));
      }, { once: true });
    });
    await page.getByRole('button', { name: `Bàn F16-D-${code} · ${label}`, exact: true }).click();
    await page.locator('.sw-inspector').getByText(expected, { exact: true }).waitFor();
    assert(await page.locator('.sw-marker[aria-pressed="true"]').count() === 1, 'Expected one selected desk');
    assert(await page.locator('.sw-selection').count() === 1, 'Missing selection outline');
    await page.waitForFunction(() => window.__selectionPaint !== null);
    selectionTimes.push({ code, pointerUpToTwoFramesMs: await page.evaluate(() => window.__selectionPaint) });
    if (code === '065' || code === '066' || code === '068') {
      await page.screenshot({ path: `output/playwright/spatial-${code === '065' ? 'occupied' : code === '066' ? 'available' : 'conflict'}.png` });
    }
  }
  // The desktop itself, not only its avatar, is clickable.
  await page.locator('.sw-furniture[data-workstation-id="ws-16-066"] .sw-desktop > g > polygon:last-child').click();
  await page.locator('.sw-inspector').getByText('Chưa có nhân sự được gán').waitFor();
  await page.getByRole('button', { name: 'Phóng to', exact: true }).click();
  assert(await page.getByLabel('Mức thu phóng').textContent() === '120%', 'Zoom failed');
  await page.getByRole('button', { name: 'Vừa khung', exact: true }).click();
  assert(await page.getByLabel('Mức thu phóng').textContent() === '100%', 'Fit failed');
  // Pan empty canvas without accidentally changing selection.
  const box = await page.locator('.sw-scene').boundingBox();
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 75, { steps: 5 });
  await page.mouse.up();
  assert(await page.locator('.sw-inspector h2').textContent() === 'F16-D-066', 'Pan changed selection');
  await page.getByRole('button', { name: 'Vừa khung', exact: true }).click();
  await page.getByRole('button', { name: 'Đối chiếu trên bản vẽ', exact: true }).click();
  await page.locator('.fp-svg').waitFor();
  assert(await page.locator('.sw-scene').count() === 0, 'Workspace still in verification mode');
  assert(await page.getByText('Nguyễn Văn Minh', { exact: true }).count() === 0, 'Operational people leaked into verification');
  await page.screenshot({ path: 'output/playwright/verification-preserved.png' });
  await page.getByRole('radio', { name: 'Bố trí chỗ ngồi', exact: true }).click();
  await page.locator('.sw-inspector h2').waitFor();
  assert(await page.locator('.sw-inspector h2').textContent() === 'F16-D-066', 'Selection lost on mode roundtrip');
  const search = page.getByRole('combobox', { name: 'Tìm kiếm trên mặt bằng' });
  await search.fill('nguyen van minh');
  await search.press('Enter');
  await page.locator('.sw-inspector').getByText('Nguyễn Văn Minh', { exact: true }).waitFor();
  await page.getByRole('application').press('Escape');
  assert(await page.locator('.sw-inspector').count() === 0, 'Escape did not clear');
  await page.getByRole('application').press('ArrowRight');
  assert(await page.locator('.sw-inspector').count() === 1, 'Arrow navigation failed');
  await page.getByRole('application').press('Escape');
  await page.getByRole('heading', { name: 'Mô hình & Nền tảng AI', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/spatial-overview.png' });
  const sizes = [];
  for (const [width, height] of [[1600,1000],[1440,900],[1280,800],[1024,768],[768,900]]) {
    await page.setViewportSize({ width, height });
    sizes.push(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, sceneWidth: document.querySelector('.sw-scene').getBoundingClientRect().width })));
    assert(sizes.at(-1).scrollWidth === width, `Page overflow at ${width}px`);
    if (width === 1280) await page.screenshot({ path: 'output/playwright/spatial-laptop.png' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  return { statesChecked: stateCases.length, desks: 19, selectionTimes, sizes, errors, writes, svgElements: await page.locator('.sw-scene *').count() };
}
