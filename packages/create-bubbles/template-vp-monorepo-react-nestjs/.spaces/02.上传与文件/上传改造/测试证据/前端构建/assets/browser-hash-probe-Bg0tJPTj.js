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
    let o = new Worker(new URL(`/assets/sha256.worker-fipMHgcO.js`, `` + import.meta.url), {
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
  let e = globalThis.Worker,
    t = 0,
    n = 0,
    r = 0,
    a = 0,
    o = 0,
    s = 0,
    c = performance.now(),
    l = setInterval(() => {
      let e = performance.now()
      ;((s = Math.max(s, e - c)), (c = e), (o += 1))
    }, 10)
  globalThis.Worker = class extends e {
    released = !1
    constructor(e, i) {
      ;(super(e, i), (t += 1), (r += 1), (n = Math.max(n, t)))
    }
    terminate() {
      ;(this.released || ((this.released = !0), --t, (a += 1)), super.terminate())
    }
  }
  let u = performance.now()
  try {
    let e = await Promise.all(
        [0, 3, 5242897, 16777217].map(async (e) => {
          let t = Uint8Array.from({ length: e }, (e, t) => t % 256),
            n = []
          return {
            size: e,
            sha256: await i({
              file: new File([t], `${e}.bin`),
              onProgress: ({ processedBytes: e }) => n.push(e),
            }),
            progress: n,
          }
        }),
      ),
      c = new Blob(Array(64).fill(new Uint8Array(1048576))),
      l = new AbortController(),
      d = new AbortController(),
      f = i({ file: c, signal: l.signal, onProgress: () => l.abort() }).then(
        () => `unexpected-success`,
        (e) => e.name,
      ),
      p = i({ file: c }),
      m = i({ file: c, signal: d.signal }).then(
        () => `unexpected-success`,
        (e) => e.name,
      )
    return (
      d.abort(),
      {
        results: e,
        runningCancel: await f,
        queuedCancel: await m,
        largeSha256: await p,
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
        maxActiveWorkers: n,
        activeWorkers: t,
        createdWorkers: r,
        terminatedWorkers: a,
        heartbeatCount: o,
        maxHeartbeatDelayMs: s,
        elapsedMs: performance.now() - u,
      }
    )
  } finally {
    ;(clearInterval(l), (globalThis.Worker = e))
  }
}
Object.assign(globalThis, { runFileHashProbe: o })
