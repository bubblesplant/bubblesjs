;(function () {
  let e = document.createElement(`link`).relList
  if (e && e.supports && e.supports(`modulepreload`)) return
  for (let e of document.querySelectorAll(`link[rel="modulepreload"]`)) n(e)
  new MutationObserver((e) => {
    for (let t of e)
      if (t.type === `childList`)
        for (let e of t.addedNodes) e.tagName === `LINK` && e.rel === `modulepreload` && n(e)
  }).observe(document, { childList: !0, subtree: !0 })
  function t(e) {
    let t = {}
    return (
      e.integrity && (t.integrity = e.integrity),
      e.referrerPolicy && (t.referrerPolicy = e.referrerPolicy),
      (t.credentials =
        e.crossOrigin === `use-credentials`
          ? `include`
          : e.crossOrigin === `anonymous`
            ? `omit`
            : `same-origin`),
      t
    )
  }
  function n(e) {
    if (e.ep) return
    e.ep = !0
    let n = t(e)
    fetch(e.href, n)
  }
})()
var e = 2,
  t = 0,
  n = []
function r(r) {
  return new Promise((i, a) => {
    r?.throwIfAborted()
    let o = () => {
        let e = n.indexOf(s)
        ;(e >= 0 && n.splice(e, 1), a(r?.reason))
      },
      s = () => {
        ;(r?.removeEventListener(`abort`, o), (t += 1))
        let e = !1
        i(() => {
          e || ((e = !0), --t, n.shift()?.())
        })
      }
    t < e ? s() : (n.push(s), r?.addEventListener(`abort`, o, { once: !0 }))
  })
}
async function i(e) {
  let t = await r(e.signal)
  try {
    return (e.signal?.throwIfAborted(), await a(e))
  } finally {
    t()
  }
}
function a({ file: e, signal: t, onProgress: n, chunkSize: r }) {
  return new Promise((i, a) => {
    let o = new Worker(new URL(`/assets/sha256.worker-Dg3lrN6b.js`, `` + import.meta.url), {
        type: `module`,
      }),
      s = !1,
      c = (e) => {
        s ||
          ((s = !0),
          t?.removeEventListener(`abort`, l),
          (o.onmessage = null),
          (o.onerror = null),
          (o.onmessageerror = null),
          o.terminate(),
          `error` in e ? a(e.error) : i(e.sha256))
      },
      l = () => c({ error: t?.reason })
    ;(t?.addEventListener(`abort`, l, { once: !0 }),
      (o.onmessage = (e) => {
        if (!s)
          try {
            let t = e.data
            switch (t.type) {
              case `progress`:
                n?.(t.progress)
                break
              case `complete`:
                c({ sha256: t.sha256 })
                break
              case `error`: {
                let e = Error(t.message)
                ;((e.name = t.name), c({ error: e }))
                break
              }
              default:
                c({ error: Error(`摘要线程返回未知消息`) })
            }
          } catch (e) {
            c({ error: e })
          }
      }),
      (o.onerror = (e) => {
        ;(e.preventDefault(), c({ error: Error(e.message || `无法启动文件摘要线程`) }))
      }),
      (o.onmessageerror = () => c({ error: Error(`无法读取摘要线程消息`) })))
    try {
      o.postMessage({ file: e, chunkSize: r })
    } catch (e) {
      c({ error: e })
    }
  })
}
async function o() {
  let e = [0, 3, 5242897, 16777217].map((e) => {
      let t = Uint8Array.from({ length: e }, (e, t) => t % 256)
      return { size: e, file: new File([t], `${e}.bin`) }
    }),
    t = new Blob(Array(64).fill(new Uint8Array(1048576))),
    n = globalThis.Worker,
    r = 0,
    a = 0,
    o = 0,
    s = 0,
    c = 0,
    l = 0,
    u = performance.now(),
    d = setInterval(() => {
      let e = performance.now()
      ;((l = Math.max(l, e - u)), (u = e), (c += 1))
    }, 10)
  globalThis.Worker = class extends n {
    released = !1
    constructor(e, t) {
      ;(super(e, t), (r += 1), (o += 1), (a = Math.max(a, r)))
    }
    terminate() {
      ;(this.released || ((this.released = !0), --r, (s += 1)), super.terminate())
    }
  }
  let f = performance.now()
  try {
    let n = await Promise.all(
        e.map(async ({ size: e, file: t }) => {
          let n = []
          return {
            size: e,
            sha256: await i({ file: t, onProgress: ({ processedBytes: e }) => n.push(e) }),
            progress: n,
          }
        }),
      ),
      u = new AbortController(),
      d = new AbortController(),
      p = i({ file: t, signal: u.signal, onProgress: () => u.abort() }).then(
        () => `unexpected-success`,
        (e) => e.name,
      ),
      m = i({ file: t }),
      h = i({ file: t, signal: d.signal }).then(
        () => `unexpected-success`,
        (e) => e.name,
      )
    return (
      d.abort(),
      {
        results: n,
        runningCancel: await p,
        queuedCancel: await h,
        largeSha256: await m,
        callbackError: await i({
          file: new Blob([`abc`]),
          onProgress: () => {
            throw Error(`probe-callback-error`)
          },
        }).then(
          () => `unexpected-success`,
          (e) => e.message,
        ),
        recoverySha256: await i({ file: new Blob([`abc`]) }),
        maxActiveWorkers: a,
        activeWorkers: r,
        createdWorkers: o,
        terminatedWorkers: s,
        heartbeatCount: c,
        maxHeartbeatDelayMs: l,
        elapsedMs: performance.now() - f,
      }
    )
  } finally {
    ;(clearInterval(d), (globalThis.Worker = n))
  }
}
Object.assign(globalThis, { runFileHashProbe: o })
