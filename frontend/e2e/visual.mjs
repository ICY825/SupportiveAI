/**
 * Visual regression + layout assertions for both floor-planning modes.
 *
 * Run against a production preview build:
 *   npm run build && npm run preview -- --port 4173
 *   node e2e/visual.mjs [--out ../output/playwright]
 *
 * Writes one PNG per canonical state and a JSON report of the measurements the
 * assertions are based on, so map size regressions are visible as numbers too.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const outArg = process.argv.indexOf('--out')
const OUT = resolve(HERE, outArg > -1 ? process.argv[outArg + 1] : '../../output/playwright')
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173'
const url = (query) => `${BASE}/#/floor-planning?floor=floor-16&${query}`

/** Widths the product supports. Not a mobile UI: the narrowest is a small laptop. */
const WIDTHS = [
  [2560, 1440, 'ultrawide'],
  [1920, 1080, 'desktop'],
  [1440, 900, 'default'],
  [1366, 768, 'laptop-small'],
  [1280, 800, 'laptop'],
]

const report = { generatedAt: new Date().toISOString(), states: [], widths: [], errors: [], failures: [] }

function check(condition, message) {
  if (!condition) report.failures.push(message)
  return condition
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`) })
}

/**
 * How large the floor is actually drawn, measured from the furniture rather than
 * from the SVG root: the renderers carry clipped and off-screen source geometry
 * whose bounding box says nothing about what the user sees.
 *
 * `drawn` is in screen pixels over a fixed set of floor objects, so comparing it
 * across runs compares the map's scale directly.
 */
async function mapScale(page, canvasSelector, inkSelector) {
  return page.evaluate(
    ([canvasSel, inkSel]) => {
      const canvas = document.querySelector(canvasSel)
      const ink = [...document.querySelectorAll(inkSel)]
      if (!canvas || !ink.length) return null
      const c = canvas.getBoundingClientRect()
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const el of ink) {
        const r = el.getBoundingClientRect()
        x0 = Math.min(x0, r.left)
        y0 = Math.min(y0, r.top)
        x1 = Math.max(x1, r.right)
        y1 = Math.max(y1, r.bottom)
      }
      return {
        canvas: [Math.round(c.width), Math.round(c.height)],
        drawn: [Math.round(x1 - x0), Math.round(y1 - y0)],
        fillX: +((x1 - x0) / c.width).toFixed(3),
        fillY: +((y1 - y0) / c.height).toFixed(3),
      }
    },
    [canvasSelector, inkSelector],
  )
}

const WORKSPACE_INK = '.sw-furniture polygon'
const VERIFICATION_INK = '.fp-ws'

const measure = (page, view) =>
  view === 'workspace'
    ? mapScale(page, '.sw-map-stage', WORKSPACE_INK)
    : mapScale(page, '.fp-map', VERIFICATION_INK)

/**
 * Every pair of these must stay visually separate. Nested pairs are skipped:
 * a floating control sitting inside its own map is containment, not collision.
 */
async function overlaps(page, selectors) {
  return page.evaluate((sels) => {
    const boxes = sels
      .map((s) => ({ s, el: document.querySelector(s) }))
      .filter(({ el }) => el)
    const hits = []
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue
        const ra = a.el.getBoundingClientRect()
        const rb = b.el.getBoundingClientRect()
        if (ra.left < rb.right - 1 && rb.left < ra.right - 1 && ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1)
          hits.push(`${a.s} ∩ ${b.s}`)
      }
    return hits
  }, selectors)
}

/** Text cut off by its own box: Vietnamese labels are long and truncate quietly. */
async function clipped(page, selectors) {
  return page.evaluate((sels) => {
    const bad = []
    for (const sel of sels)
      for (const el of document.querySelectorAll(sel)) {
        if (el.scrollWidth > el.clientWidth + 1)
          bad.push(`${sel}: "${el.textContent.trim().slice(0, 40)}" overflows`)
      }
    return bad
  }, selectors)
}

/** An input whose placeholder does not fit is the same defect, measured differently. */
async function truncatedPlaceholders(page) {
  return page.evaluate(() => {
    const bad = []
    for (const input of document.querySelectorAll('input[placeholder]')) {
      const probe = document.createElement('span')
      const cs = getComputedStyle(input)
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font}`
      probe.textContent = input.placeholder
      document.body.append(probe)
      const room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      if (probe.offsetWidth > room) bad.push(`"${input.placeholder}" needs ${Math.ceil(probe.offsetWidth)}px, has ${Math.floor(room)}px`)
      probe.remove()
    }
    return bad
  })
}

async function run() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  page.on('pageerror', (e) => report.errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && report.errors.push(m.text()))

  // ---------------------------------------------------------------- workspace
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(url('view=workspace'))
  await page.getByRole('application').waitFor()
  check((await page.locator('.sw-marker').count()) === 19, 'workspace: expected 19 desks')

  await page.getByRole('heading', { name: 'Mô hình & Nền tảng AI', exact: true }).click()
  report.states.push({ name: 'spatial-overview', map: await measure(page, 'workspace') })
  await shot(page, 'spatial-overview')

  const cases = [
    ['065', 'Đang sử dụng', 'Nguyễn Văn Minh', 'spatial-occupied'],
    ['066', 'Còn trống', 'Chưa có nhân sự được gán', 'spatial-available'],
    ['068', 'Xung đột phân công', 'Vũ Thị Lan', 'spatial-conflict'],
  ]
  for (const [code, label, expected, name] of cases) {
    await page.getByRole('button', { name: `Bàn F16-D-${code} · ${label}`, exact: true }).click()
    await page.locator('.sw-inspector').getByText(expected, { exact: true }).waitFor()
    check((await page.locator('.sw-marker[aria-pressed="true"]').count()) === 1, `${name}: one desk selected`)
    check((await page.locator('.sw-selection').count()) === 1, `${name}: selection outline drawn`)
    const hits = await overlaps(page, ['.sw-map-panel', '.sw-context', '.sw-scope-note'])
    check(hits.length === 0, `${name}: overlap ${hits.join(', ')}`)
    report.states.push({ name, map: await measure(page, 'workspace') })
    await shot(page, name)
  }
  await page.getByRole('application').press('Escape')

  // ------------------------------------------------------- layout editor
  // Edit mode adds a grid, a selection box and two buttons. None of it may
  // appear in view mode, and none of it may push the map around.
  await page.goto(url('view=workspace'))
  await page.getByRole('application').waitFor()
  check((await page.locator('.sw-edit-grid').count()) === 0, 'view mode: edit grid is drawn before entering edit mode')
  const viewMap = await measure(page, 'workspace')

  await page.getByRole('radio', { name: 'Chỉnh sửa bố trí' }).click()
  await page.locator('.sw-edit-grid').waitFor()
  check((await page.locator('.sw-edit-grid circle').count()) > 50, 'edit: grid has too few points to read as a grid')
  check((await page.locator('.sw-edit-boundary').count()) === 1, 'edit: editable-area outline missing')
  const editMap = await measure(page, 'workspace')
  check(
    editMap.canvas[0] === viewMap.canvas[0] && editMap.canvas[1] === viewMap.canvas[1],
    `edit: entering edit mode resized the map — ${viewMap.canvas.join('x')} vs ${editMap.canvas.join('x')}`,
  )
  report.states.push({ name: 'spatial-edit-grid', map: editMap })
  await shot(page, 'spatial-edit-grid')

  await page.getByRole('button', { name: 'Bàn F16-D-065 · Đang sử dụng', exact: true }).click()
  await page.locator('.sw-edit-inspector').waitFor()
  check((await page.locator('.sw-edit-box').count()) === 1, 'edit: selection box missing')
  check((await page.locator('.sw-edit-handle').count()) === 1, 'edit: rotate handle missing')
  const editHits = await overlaps(page, ['.sw-map-panel', '.sw-context', '.sw-edit-toolbar'])
  check(editHits.length === 0, `spatial-edit-selected: overlap ${editHits.join(', ')}`)
  report.states.push({ name: 'spatial-edit-selected', map: await measure(page, 'workspace') })
  await shot(page, 'spatial-edit-selected')

  // an invalid placement must be visible on the object, not only in the panel
  await page.locator('.sw-scene').press('ArrowRight')
  await page.locator('.sw-placement-status[data-valid="false"]').first().waitFor()
  check((await page.locator('.sw-edit-invalid').count()) > 0, 'edit: invalid placement is not marked on the map')
  check(await page.getByRole('button', { name: 'Lưu bố trí' }).isDisabled(), 'edit: Save is offered for an invalid layout')
  // the toolbar reports placement problems; it must not reflow the page while
  // doing it, or the map jumps every time a desk crosses another one
  const invalidMap = await measure(page, 'workspace')
  check(
    invalidMap.canvas[0] === editMap.canvas[0] && invalidMap.canvas[1] === editMap.canvas[1],
    `edit: an invalid placement resized the map — ${editMap.canvas.join('x')} vs ${invalidMap.canvas.join('x')}`,
  )
  report.states.push({ name: 'spatial-edit-invalid', map: invalidMap })
  await shot(page, 'spatial-edit-invalid')

  await page.getByRole('button', { name: 'Hủy', exact: true }).click()
  check((await page.locator('.sw-edit-grid').count()) === 0, 'edit: grid survives Hủy')
  await page.getByRole('application').press('Escape')

  // keyboard selection must stay usable and visibly focused in both modes
  for (const [view, mapSelector] of [['workspace', '.sw-scene'], ['verification', '.fp-svg']]) {
    await page.goto(url(`view=${view}`))
    await page.locator(mapSelector).waitFor()
    await page.locator(mapSelector).focus()
    // the ring is :focus-visible, so the check must not depend on whether an
    // earlier step in this file happened to end on a click or on a key
    await page.locator(mapSelector).press('Shift')
    const ring = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).boxShadow, mapSelector)
    check(ring !== 'none', `${view}: focused map has no visible focus ring`)
    await page.locator(mapSelector).press('ArrowRight')
    const selected = await page.locator(`${mapSelector} [aria-pressed="true"], .fp-selection`).count()
    check(selected > 0, `${view}: arrow key did not select anything`)
    await page.locator(mapSelector).press('Escape')
  }

  // ---------------------------------------------------------- verification
  await page.goto(url('view=verification'))
  await page.locator('.fp-svg').waitFor()
  // the keyboard check above left the map focused; canonical shots show the resting state
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.waitForTimeout(400)
  report.states.push({ name: 'verification-overview', map: await measure(page, 'verification') })
  await shot(page, 'verification-overview')

  // source overlay: the technical comparison this mode exists for
  await page.getByRole('button', { name: 'Cài đặt bản đồ' }).click()
  await page.getByRole('radio', { name: 'Chồng lớp' }).click()
  await page.waitForTimeout(500)
  await shot(page, 'verification-overlay')
  check((await page.locator('.fp-source').count()) === 1, 'verification: source raster missing in overlay mode')

  await page.getByRole('radio', { name: 'Bản đồ số' }).click()
  await page.getByRole('switch', { name: 'Chế độ kiểm tra' }).check()
  await page.waitForTimeout(300)
  check((await page.locator('.fp-debug').count()) === 1, 'verification: debug layer missing')
  await shot(page, 'verification-debug')
  await page.getByRole('switch', { name: 'Chế độ kiểm tra' }).uncheck()
  await page.getByRole('button', { name: 'Đóng cài đặt bản đồ' }).click()

  // selected zone: the inspector structure both modes share
  await page.locator('.fp-zone[data-entity-id="zone-16-ai-platform"]').click({ force: true })
  await page.locator('.fp-panel-head h2').waitFor()
  await page.waitForTimeout(250)
  // panels must not collide; the floating overlays must not collide with each other
  const vHits = [
    ...(await overlaps(page, ['.fp-main', '.fp-panel', '.fp-sidebar'])),
    ...(await overlaps(page, ['.fp-hover', '.fp-map-foot', '.fp-coords'])),
  ]
  check(vHits.length === 0, `verification-selected: overlap ${vHits.join(', ')}`)

  // every block of the details panel folds the same way
  const blocks = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.fp-panel .fp-section, .fp-panel .fp-technical, .fp-panel .fp-raw')]
    return {
      total: all.length,
      notDisclosures: all.filter((el) => el.tagName !== 'DETAILS' || !el.querySelector(':scope > summary')).length,
    }
  })
  check(blocks.total > 0, 'verification-selected: no panel sections found')
  check(blocks.notDisclosures === 0, `verification-selected: ${blocks.notDisclosures} panel section(s) are not collapsible`)
  await shot(page, 'verification-selected')

  // ---------------------------------------------------------------- widths
  for (const [width, height, label] of WIDTHS) {
    for (const view of ['workspace', 'verification']) {
      await page.setViewportSize({ width, height })
      await page.goto(url(`view=${view}`))
      // only the hash changes between these, so force the first-load path that
      // decides whether the module nav starts collapsed at this width
      await page.reload()
      await page.locator(view === 'workspace' ? '.sw-scene' : '.fp-svg').waitFor()
      await page.waitForTimeout(500)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth)
      check(overflow <= width, `${view} @${width}: horizontal overflow (${overflow}px)`)
      const map = await measure(page, view)
      const bad = [
        ...(await clipped(page, ['.fp-topbar h1', '.fp-segmented button', '.fp-page-title', '.sw-heading-meta', '.sw-edit-state'])),
        ...(await truncatedPlaceholders(page)),
      ]
      check(bad.length === 0, `${view} @${width}: ${bad.join('; ')}`)
      const inspector = await page.evaluate(() => {
        const el = document.querySelector('.fp-panel, .sw-context')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { width: Math.round(r.width), right: Math.round(r.right), top: Math.round(r.top) }
      })
      report.widths.push({ width, height, label, view, overflow, map, inspector })
      if (label === 'laptop') await shot(page, view === 'workspace' ? 'spatial-laptop' : 'verification-laptop')
    }
  }

  // Both modes are one product: switching tabs must not move the inspector.
  for (const [width] of WIDTHS) {
    const pair = report.widths.filter((w) => w.width === width && w.inspector)
    if (pair.length !== 2) continue
    const [a, b] = pair
    check(
      a.inspector.width === b.inspector.width && a.inspector.right === b.inspector.right && a.inspector.top === b.inspector.top,
      `@${width}: inspector moves between modes — ${a.view} ${JSON.stringify(a.inspector)} vs ${b.view} ${JSON.stringify(b.inspector)}`,
    )
    check(
      a.map.canvas[0] === b.map.canvas[0],
      `@${width}: map canvas width differs between modes — ${a.map.canvas[0]} vs ${b.map.canvas[0]}`,
    )
  }

  await browser.close()
  await writeFile(resolve(OUT, 'visual-report.json'), JSON.stringify(report, null, 2))
  const worst = report.widths
    .filter((w) => w.map)
    .map((w) => `${w.view}@${w.width}: drawn ${w.map.drawn.join('×')} in ${w.map.canvas.join('×')}`)
  console.log(worst.join('\n'))
  if (report.errors.length) console.log('page errors:\n' + report.errors.join('\n'))
  if (report.failures.length) {
    console.log('FAILURES:\n' + report.failures.join('\n'))
    process.exitCode = 1
  } else {
    console.log('\nall visual assertions passed')
  }
}

run()
