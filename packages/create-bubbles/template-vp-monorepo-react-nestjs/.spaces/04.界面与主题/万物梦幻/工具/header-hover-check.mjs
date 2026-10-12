import assert from 'node:assert/strict'

/** 读取可见头部元素的几何及影响布局的样式，不把颜色反馈误判为抖动。 */
async function snapshot(header) {
  return header.evaluate((root) =>
    [root, ...root.querySelectorAll('*')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          name: element.getAttribute('aria-label') || element.tagName,
          box: [box.x, box.y, box.width, box.height],
          layout: [
            style.padding,
            style.margin,
            style.borderWidth,
            style.borderStyle,
            style.fontSize,
            style.fontWeight,
            style.display,
            style.transform,
          ],
        }
      }),
  )
}

/** 对比过渡中的头部位置和尺寸，容忍浏览器的小数舍入。 */
function assertStable(initial, current) {
  assert.equal(current.length, initial.length, '可见头部元素数量发生变化')
  initial.forEach((item, index) => {
    item.box.forEach((value, axis) => {
      assert(
        Math.abs(current[index].box[axis] - value) < 0.02,
        `${item.name} 的几何发生变化：${item.box} → ${current[index].box}`,
      )
    })
    assert.deepEqual(current[index].layout, item.layout, `${item.name} 的盒模型发生变化`)
  })
}

/** 单独测量纯 hover 的浏览器布局计数，避免同步 DOM 测量干扰结果。 */
async function hoverMetrics({ session, page, position }) {
  const before = await session.send('Performance.getMetrics')
  await page.mouse.move(position.x, position.y)
  await page.waitForTimeout(240)
  const after = await session.send('Performance.getMetrics')
  const metric = (result, name) => result.metrics.find((item) => item.name === name).value
  return {
    layoutCount: metric(after, 'LayoutCount') - metric(before, 'LayoutCount'),
    recalcStyleCount: metric(after, 'RecalcStyleCount') - metric(before, 'RecalcStyleCount'),
  }
}

/** 验证工作区及各作用域头部的语言、账户和切换空间按钮在 hover／按下时稳定。 */
export async function checkHeaderHover({ context, page, header }) {
  const session = await context.newCDPSession(page)
  await session.send('Performance.enable')
  const headerBox = await header.boundingBox()
  const gap = { x: page.viewportSize().width / 2, y: headerBox.y + headerBox.height / 2 }
  const targets = page.locator(
    '.locale-switch-trigger, .workspace-account-trigger, .workspace-switch',
  )
  const result = []
  for (const target of await targets.all()) {
    await target.evaluate((element) => element.blur())
    await page.mouse.move(gap.x, gap.y)
    await page.waitForTimeout(300)
    const initial = await snapshot(header)
    const box = await target.boundingBox()
    const position = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const css = await target.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        transition: style.transitionProperty,
        feedback: [style.backgroundColor, style.color, style.borderColor],
      }
    })
    assert(
      !css.transition
        .split(',')
        .some((item) =>
          ['all', 'width', 'height', 'padding', 'margin', 'border-width'].includes(item.trim()),
        ),
      '头部入口存在影响布局的 transition',
    )
    const metrics = await hoverMetrics({ session, page, position })
    assert.equal(metrics.layoutCount, 0, '纯 hover 区间发生布局')
    assertStable(initial, await snapshot(header))
    const hoveredFeedback = await target.evaluate((element) => {
      const style = getComputedStyle(element)
      return [style.backgroundColor, style.color, style.borderColor]
    })
    assert.notDeepEqual(hoveredFeedback, css.feedback, 'hover 无颜色反馈')
    await page.mouse.move(gap.x, gap.y)
    await page.mouse.move(position.x, position.y)
    for (let index = 0; index < 12; index += 1) {
      await page.evaluate(() => new Promise(requestAnimationFrame))
      assertStable(initial, await snapshot(header))
    }
    await page.mouse.down()
    assert(await target.evaluate((element) => element.matches(':active')), '按下状态未触发')
    for (let index = 0; index < 12; index += 1) {
      await page.evaluate(() => new Promise(requestAnimationFrame))
      assertStable(initial, await snapshot(header))
    }
    await page.mouse.move(gap.x, gap.y)
    await page.mouse.up()
    await target.focus()
    assertStable(initial, await snapshot(header))
    await target.evaluate((element) => element.blur())
    result.push({
      target: await target.getAttribute('aria-label'),
      ...metrics,
      transition: css.transition,
      sampledFrames: 24,
      geometryStable: true,
    })
  }
  await session.detach()
  return result
}
