;(function () {
  /*!
   * hash-wasm (https://www.npmjs.com/package/hash-wasm)
   * (c) Dani Biro
   * @license MIT
   */
  function e(e, t, n, r) {
    function i(e) {
      return e instanceof n
        ? e
        : new n(function (t) {
            t(e)
          })
    }
    return new (n ||= Promise)(function (n, a) {
      function o(e) {
        try {
          c(r.next(e))
        } catch (e) {
          a(e)
        }
      }
      function s(e) {
        try {
          c(r.throw(e))
        } catch (e) {
          a(e)
        }
      }
      function c(e) {
        e.done ? n(e.value) : i(e.value).then(o, s)
      }
      c((r = r.apply(e, t || [])).next())
    })
  }
  var t = class {
    constructor() {
      this.mutex = Promise.resolve()
    }
    lock() {
      let e = () => {}
      return (
        (this.mutex = this.mutex.then(() => new Promise(e))),
        new Promise((t) => {
          e = t
        })
      )
    }
    dispatch(t) {
      return e(this, void 0, void 0, function* () {
        let e = yield this.lock()
        try {
          return yield Promise.resolve(t())
        } finally {
          e()
        }
      })
    }
  }
  function n() {
    return typeof globalThis < `u`
      ? globalThis
      : typeof self < `u`
        ? self
        : typeof window < `u`
          ? window
          : global
  }
  let r = n(),
    i = r.Buffer ?? null,
    a = r.TextEncoder ? new r.TextEncoder() : null
  function o(e, t) {
    return (
      (((e & 15) + ((e >> 6) | ((e >> 3) & 8))) << 4) | ((t & 15) + ((t >> 6) | ((t >> 3) & 8)))
    )
  }
  function s(e, t) {
    let n = t.length >> 1
    for (let r = 0; r < n; r++) {
      let n = r << 1
      e[r] = o(t.charCodeAt(n), t.charCodeAt(n + 1))
    }
  }
  function c(e, t) {
    if (e.length !== t.length * 2) return !1
    for (let n = 0; n < t.length; n++) {
      let r = n << 1
      if (t[n] !== o(e.charCodeAt(r), e.charCodeAt(r + 1))) return !1
    }
    return !0
  }
  function l(e, t, n) {
    let r = 0
    for (let i = 0; i < n; i++) {
      let n = t[i] >>> 4
      ;((e[r++] = n > 9 ? n + 87 : n + 48), (n = t[i] & 15), (e[r++] = n > 9 ? n + 87 : n + 48))
    }
    return String.fromCharCode.apply(null, e)
  }
  let u =
      i === null
        ? (e) => {
            if (typeof e == `string`) return a.encode(e)
            if (ArrayBuffer.isView(e)) return new Uint8Array(e.buffer, e.byteOffset, e.byteLength)
            throw Error(`Invalid data type!`)
          }
        : (e) => {
            if (typeof e == `string`) {
              let t = i.from(e, `utf8`)
              return new Uint8Array(t.buffer, t.byteOffset, t.length)
            }
            if (i.isBuffer(e)) return new Uint8Array(e.buffer, e.byteOffset, e.length)
            if (ArrayBuffer.isView(e)) return new Uint8Array(e.buffer, e.byteOffset, e.byteLength)
            throw Error(`Invalid data type!`)
          },
    d = /* @__PURE__ */ new Uint8Array(256)
  for (let e = 0; e < 64; e++)
    d[`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/`.charCodeAt(e)] = e
  function f(e) {
    let t = Math.floor(e.length * 0.75),
      n = e.length
    return (e[n - 1] === `=` && (--t, e[n - 2] === `=` && --t), t)
  }
  function p(e) {
    let t = f(e),
      n = e.length,
      r = new Uint8Array(t),
      i = 0
    for (let t = 0; t < n; t += 4) {
      let n = d[e.charCodeAt(t)],
        a = d[e.charCodeAt(t + 1)],
        o = d[e.charCodeAt(t + 2)],
        s = d[e.charCodeAt(t + 3)]
      ;((r[i] = (n << 2) | (a >> 4)),
        (i += 1),
        (r[i] = ((a & 15) << 4) | (o >> 2)),
        (i += 1),
        (r[i] = ((o & 3) << 6) | (s & 63)),
        (i += 1))
    }
    return r
  }
  let m = 16384,
    ee = new t(),
    te = /* @__PURE__ */ new Map()
  function ne(t, n) {
    return e(this, void 0, void 0, function* () {
      let r = null,
        i = null,
        a = !1
      if (typeof WebAssembly > `u`) throw Error(`WebAssembly is not supported in this environment!`)
      let o = (e, t = 0) => {
          i.set(e, t)
        },
        d = () => i,
        f = () => r.exports,
        ne = (e) => {
          r.exports.Hash_SetMemorySize(e)
          let t = r.exports.Hash_GetBuffer(),
            n = r.exports.memory.buffer
          i = new Uint8Array(n, t, e)
        },
        re = () => new DataView(r.exports.memory.buffer).getUint32(r.exports.STATE_SIZE, !0),
        ie = ee.dispatch(() =>
          e(this, void 0, void 0, function* () {
            if (!te.has(t.name)) {
              let e = p(t.data),
                n = WebAssembly.compile(e)
              te.set(t.name, n)
            }
            let e = yield te.get(t.name)
            r = yield WebAssembly.instantiate(e, {})
          }),
        ),
        ae = () =>
          e(this, void 0, void 0, function* () {
            r || (yield ie)
            let e = r.exports.Hash_GetBuffer(),
              t = r.exports.memory.buffer
            i = new Uint8Array(t, e, m)
          }),
        oe = (e = null) => {
          ;((a = !0), r.exports.Hash_Init(e))
        },
        se = (e) => {
          let t = 0
          for (; t < e.length;) {
            let n = e.subarray(t, t + m)
            ;((t += n.length), i.set(n), r.exports.Hash_Update(n.length))
          }
        },
        ce = (e) => {
          if (!a) throw Error(`update() called before init()`)
          let t = u(e)
          se(t)
        },
        h = new Uint8Array(n * 2),
        le = (e, t = null) => {
          if (!a) throw Error(`digest() called before init()`)
          return ((a = !1), r.exports.Hash_Final(t), e === `binary` ? i.slice(0, n) : l(h, i, n))
        },
        ue = () => {
          if (!a) throw Error(`save() can only be called after init() and before digest()`)
          let e = r.exports.Hash_GetState(),
            n = re(),
            i = r.exports.memory.buffer,
            o = new Uint8Array(i, e, n),
            c = new Uint8Array(4 + n)
          return (s(c, t.hash), c.set(o, 4), c)
        },
        de = (e) => {
          if (!(e instanceof Uint8Array))
            throw Error(`load() expects an Uint8Array generated by save()`)
          let n = r.exports.Hash_GetState(),
            i = re(),
            o = 4 + i,
            s = r.exports.memory.buffer
          if (e.length !== o) throw Error(`Bad state length (expected ${o} bytes, got ${e.length})`)
          if (!c(t.hash, e.subarray(0, 4)))
            throw Error(`This state was written by an incompatible hash implementation`)
          let l = e.subarray(4)
          ;(new Uint8Array(s, n, i).set(l), (a = !0))
        },
        g = (e) => (typeof e == `string` ? e.length < m / 4 : e.byteLength < m),
        _ = g
      switch (t.name) {
        case `argon2`:
        case `scrypt`:
          _ = () => !0
          break
        case `blake2b`:
        case `blake2s`:
          _ = (e, t) => t <= 512 && g(e)
          break
        case `blake3`:
          _ = (e, t) => t === 0 && g(e)
          break
        case `xxhash64`:
        case `xxhash3`:
        case `xxhash128`:
        case `crc64`:
          _ = () => !1
      }
      return (
        yield ae(),
        {
          getMemory: d,
          writeMemory: o,
          getExports: f,
          setMemorySize: ne,
          init: oe,
          update: ce,
          digest: le,
          save: ue,
          load: de,
          calculate: (e, t = null, a = null) => {
            if (!_(e, t)) return (oe(t), ce(e), le(`hex`, a))
            let o = u(e)
            return (i.set(o), r.exports.Hash_Calculate(o.length, t, a), l(h, i, n))
          },
          hashLength: n,
        }
      )
    })
  }
  ;(new t(),
    new t(),
    new t(),
    new t(),
    new t(),
    new t(),
    new t(),
    new t(),
    new t(),
    new t(),
    new t())
  var re = {
    name: `sha256`,
    data: `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c2pBx6KerX1qIhkgASADcyACcSABIANxcyABQR53IAFBE3dzIAFBCndzaiAaaiICaiIJIBMgEnNxIBJzaiAJQRp3IAlBFXdzIAlBB3dzakHRxqk2aiIaIAIgAXMgA3EgAiABcXMgAkEedyACQRN3cyACQQp3c2ogGGoiA2oiESAJIBNzcSATc2ogEUEadyARQRV3cyARQQd3c2pB59KkoQFqIhggAyACcyABcSADIAJxcyADQR53IANBE3dzIANBCndzaiAUaiIBaiISIBEgCXNxIAlzaiASQRp3IBJBFXdzIBJBB3dzakGFldy9AmoiFCABIANzIAJxIAEgA3FzIAFBHncgAUETd3MgAUEKd3NqIBdqIgJqIhMgI2ogJiASaiAiIBFqICUgCWogEyASIBFzcSARc2ogE0EadyATQRV3cyATQQd3c2pBuMLs8AJqIhcgAiABcyADcSACIAFxcyACQR53IAJBE3dzIAJBCndzaiAZaiIDaiIJIBMgEnNxIBJzaiAJQRp3IAlBFXdzIAlBB3dzakH827HpBGoiGSADIAJzIAFxIAMgAnFzIANBHncgA0ETd3MgA0EKd3NqIBpqIgFqIhEgCSATc3EgE3NqIBFBGncgEUEVd3MgEUEHd3NqQZOa4JkFaiIaIAEgA3MgAnEgASADcXMgAUEedyABQRN3cyABQQp3c2ogGGoiAmoiEiARIAlzcSAJc2ogEkEadyASQRV3cyASQQd3c2pB1OapqAZqIhggAiABcyADcSACIAFxcyACQR53IAJBE3dzIAJBCndzaiAUaiIDaiITaiAoIBJqICQgEWogJyAJaiATIBIgEXNxIBFzaiATQRp3IBNBFXdzIBNBB3dzakG7laizB2oiFCADIAJzIAFxIAMgAnFzIANBHncgA0ETd3MgA0EKd3NqIBdqIgFqIgkgEyASc3EgEnNqIAlBGncgCUEVd3MgCUEHd3NqQa6Si454aiIXIAEgA3MgAnEgASADcXMgAUEedyABQRN3cyABQQp3c2ogGWoiAmoiESAJIBNzcSATc2ogEUEadyARQRV3cyARQQd3c2pBhdnIk3lqIhkgAiABcyADcSACIAFxcyACQR53IAJBE3dzIAJBCndzaiAaaiIDaiISIBEgCXNxIAlzaiASQRp3IBJBFXdzIBJBB3dzakGh0f+VemoiGiADIAJz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`,
    hash: `8c18dd94`,
  }
  ;(new t(), new t())
  function ie() {
    return ne(re, 32).then((e) => {
      e.init(256)
      let t = {
        init: () => (e.init(256), t),
        update: (n) => (e.update(n), t),
        digest: (t) => e.digest(t),
        save: () => e.save(),
        load: (n) => (e.load(n), t),
        blockSize: 64,
        digestSize: 32,
      }
      return t
    })
  }
  ;(new t(), new t(), new t(), new t(), new t(), new t(), new t(), new t(), new t())
  function ae(e) {
    let t = Object.values(e).filter((e) => typeof e == `number`)
    return Object.entries(e)
      .filter(([e, n]) => t.indexOf(+e) === -1)
      .map(([e, t]) => t)
  }
  function oe(e, t = `|`) {
    return e.map((e) => Ce(e)).join(t)
  }
  function se(e, t) {
    return typeof t == `bigint` ? t.toString() : t
  }
  var ce = class {
    constructor(e) {
      ;((this._getter = e), (this._value = void 0))
    }
    get value() {
      let e = this._getter
      return (e !== void 0 && ((this._value = e()), (this._getter = void 0)), this._value)
    }
  }
  function h(e) {
    return new ce(e)
  }
  function le(e) {
    return e == null
  }
  function ue(e) {
    let t = +!!e.startsWith(`^`),
      n = e.endsWith(`$`) ? e.length - 1 : e.length
    return e.slice(t, n)
  }
  function de(e, t) {
    let n = e / t,
      r = Math.round(n),
      i = 4 * 2 ** -52 * Math.max(Math.abs(n), 1)
    return Math.abs(n - r) < i ? 0 : n - r
  }
  function g(e, t, n) {
    Object.defineProperty(e, t, { value: n, writable: !0, enumerable: !0, configurable: !0 })
  }
  function _(e) {
    let t = Object.getOwnPropertyDescriptor(e, `shape`)
    return t?.get ? t.get.raw : t?.value
  }
  function v(e) {
    return _(e._zod.def) ?? e._zod.def.shape
  }
  function fe(e, t, n) {
    Object.defineProperty(e, t, {
      get() {
        let e = n()
        return (g(this, t, e), e)
      },
      enumerable: !0,
      configurable: !0,
    })
  }
  function pe(e, t, n) {
    t in e ? g(e, t, n) : (e[t] = n)
  }
  function y(e, t, n, r) {
    let i = v(t)
    for (let a of n) {
      let n = Object.getOwnPropertyDescriptor(i, a)
      n.enumerable &&
        (n.get
          ? fe(e, a, () => {
              let e = t._zod.def.shape[a]
              return r ? r(e, a) : e
            })
          : pe(e, a, r ? r(n.value, a) : n.value))
    }
  }
  function me(e, t) {
    for (let n of Reflect.ownKeys(t)) {
      let r = Object.getOwnPropertyDescriptor(t, n)
      r.enumerable && (r.get ? fe(e, n, () => t[n]) : pe(e, n, r.value))
    }
  }
  function b(...e) {
    let t = {}
    for (let n of e) {
      let e = Object.getOwnPropertyDescriptors(n)
      Object.assign(t, e)
    }
    return Object.defineProperties({}, t)
  }
  function he(e) {
    return JSON.stringify(e)
  }
  function ge(e) {
    return e
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, ``)
      .replace(/[\s_-]+/g, `-`)
      .replace(/^-+|-+$/g, ``)
  }
  let _e = `captureStackTrace` in Error ? Error.captureStackTrace : (...e) => {}
  function ve(e) {
    return typeof e == `object` && !!e && !Array.isArray(e)
  }
  let ye = /* @__PURE__*/ h(() => {
    if (j.jitless || (typeof navigator < `u` && navigator?.userAgent?.includes(`Cloudflare`)))
      return !1
    try {
      return (Function(``), !0)
    } catch {
      return !1
    }
  })
  function be(e) {
    if (ve(e) === !1) return !1
    let t = e.constructor
    if (t === void 0 || typeof t != `function`) return !0
    let n = t.prototype
    return ve(n) !== !1 && Object.prototype.hasOwnProperty.call(n, `isPrototypeOf`) !== !1
  }
  function xe(e) {
    return be(e)
      ? { ...e }
      : Array.isArray(e)
        ? [...e]
        : e instanceof Map
          ? new Map(e)
          : e instanceof Set
            ? new Set(e)
            : e
  }
  let Se = /* @__PURE__*/ new Set([`string`, `number`, `symbol`])
  function x(e) {
    return e.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`)
  }
  function S(e, t, n) {
    let r = new e._zod.constr(t ?? e._zod.def)
    return ((!t || n?.parent) && (r._zod.parent = e), r)
  }
  function C(e) {
    let t = e
    if (!t) return {}
    if (typeof t == `string`) return { error: () => t }
    if (t?.message !== void 0) {
      if (t?.error !== void 0) throw Error('Cannot specify both `message` and `error` params')
      t.error = t.message
    }
    return (delete t.message, typeof t.error == `string` ? { ...t, error: () => t.error } : t)
  }
  function Ce(e) {
    return typeof e == `bigint` ? e.toString() + `n` : typeof e == `string` ? `"${e}"` : `${e}`
  }
  function we(e) {
    return Object.keys(e).filter(
      (t) => e[t]._zod.optin !== void 0 && e[t]._zod.optout === `optional`,
    )
  }
  let Te = {
      safeint: [-(2 ** 53 - 1), 2 ** 53 - 1],
      int32: [-2147483648, 2147483647],
      uint32: [0, 4294967295],
      float32: [-34028234663852886e22, 34028234663852886e22],
      float64: [-Number.MAX_VALUE, Number.MAX_VALUE],
    },
    Ee = {
      int64: [
        /* @__PURE__*/ BigInt(`-9223372036854775808`),
        /* @__PURE__*/ BigInt(`9223372036854775807`),
      ],
      uint64: [/* @__PURE__*/ BigInt(0), /* @__PURE__*/ BigInt(`18446744073709551615`)],
    }
  function De(e, t) {
    let n = e._zod.def,
      r = n.checks
    if (r && r.length > 0)
      throw Error(`.pick() cannot be used on object schemas containing refinements`)
    let i = {}
    return (y(i, e, Oe(e, t)), S(e, b(n, { shape: i, checks: [] })))
  }
  function Oe(e, t) {
    let n = v(e),
      r = []
    for (let e of Reflect.ownKeys(t)) {
      if (!Object.getOwnPropertyDescriptor(n, e)?.enumerable)
        throw Error(`Unrecognized key: "${String(e)}"`)
      t[e] && r.push(e)
    }
    return r
  }
  function ke(e, t) {
    let n = e._zod.def,
      r = n.checks
    if (r && r.length > 0)
      throw Error(`.omit() cannot be used on object schemas containing refinements`)
    let i = new Set(Oe(e, t)),
      a = {}
    return (
      y(
        a,
        e,
        Reflect.ownKeys(v(e)).filter((e) => !i.has(e)),
      ),
      S(e, b(n, { shape: a, checks: [] }))
    )
  }
  function Ae(e, t) {
    if (!be(t)) throw Error(`Invalid input to extend: expected a plain object`)
    let n = e._zod.def.checks
    if (n && n.length > 0) {
      let n = v(e)
      for (let e of Reflect.ownKeys(t))
        if (Object.getOwnPropertyDescriptor(n, e) !== void 0)
          throw Error(
            'Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.',
          )
    }
    return S(e, b(e._zod.def, { shape: je(e, t) }))
  }
  function je(e, t) {
    let n = {}
    return (y(n, e, Reflect.ownKeys(v(e))), me(n, t), n)
  }
  function Me(e, t) {
    if (!be(t)) throw Error(`Invalid input to safeExtend: expected a plain object`)
    return S(e, b(e._zod.def, { shape: je(e, t) }))
  }
  function Ne(e, t) {
    if (!t?._zod?.def)
      throw Error(
        'Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.',
      )
    if (e._zod.def.checks?.length)
      throw Error(
        `.merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.`,
      )
    let n = {}
    return (
      y(n, e, Reflect.ownKeys(v(e))),
      y(n, t, Reflect.ownKeys(v(t))),
      S(
        e,
        b(e._zod.def, {
          shape: n,
          get catchall() {
            return t._zod.def.catchall
          },
          checks: t._zod.def.checks ?? [],
        }),
      )
    )
  }
  function Pe(e, t, n, r = `partial`) {
    let i = t._zod.def.checks
    if (i && i.length > 0)
      throw Error(`.${r}() cannot be used on object schemas containing refinements`)
    let a = n ? new Set(Oe(t, n)) : void 0,
      o = {}
    return (
      y(
        o,
        t,
        Reflect.ownKeys(v(t)),
        e && ((t, n) => (a && !a.has(n) ? t : new e({ type: `optional`, innerType: t }))),
      ),
      S(t, b(t._zod.def, { shape: o, checks: [] }))
    )
  }
  function Fe(e, t, n) {
    let r = n ? new Set(Oe(t, n)) : void 0,
      i = {}
    return (
      y(i, t, Reflect.ownKeys(v(t)), (t, n) =>
        r && !r.has(n) ? t : new e({ type: `nonoptional`, innerType: t }),
      ),
      S(t, b(t._zod.def, { shape: i }))
    )
  }
  function w(e, t = 0) {
    if (e.aborted === !0) return !0
    for (let n = t; n < e.issues.length; n++) if (e.issues[n]?.continue !== !0) return !0
    return !1
  }
  function Ie(e, t = 0) {
    if (e.aborted === !0) return !0
    for (let n = t; n < e.issues.length; n++) if (e.issues[n]?.continue === !1) return !0
    return !1
  }
  function Le(e, t) {
    return t.map((t) => {
      var n
      return ((n = t).path ?? (n.path = []), t.path.unshift(e), t)
    })
  }
  function Re(e) {
    return typeof e == `string` ? e : e?.message
  }
  function ze(e) {
    let t = []
    for (let n of e ?? []) {
      let e = n._zod.def
      if (!/_(length|size)$|_equals$/.test(e.check)) break
      let r = e.maximum ?? e.length ?? e.size
      r >= 0 && t.push([r, n])
    }
    return t
  }
  function Be(e, t, n) {
    var r
    for (let i = t; i < e.length; i++) (r = e[i]).schema ?? (r.schema = n)
  }
  function T(e, t, n) {
    var r
    let i = e.inst?._zod?.traits
    i?.has(`$ZodType`) &&
      (i.has(`$ZodCheck`) ? ((r = e).schema ?? (r.schema = e.inst)) : (e.schema = e.inst))
    let a = e.schema === e.inst ? void 0 : e.schema?._zod.def?.error,
      o = e.message
        ? e.message
        : (Re(e.inst?._zod.def?.error?.(e)) ??
          Re(a?.(e)) ??
          Re(t?.error?.(e)) ??
          Re(n.customError?.(e)) ??
          Re(n.localeError?.(e)) ??
          `Invalid input`),
      s = {}
    for (let t of Object.keys(e))
      t !== `inst` &&
        t !== `schema` &&
        t !== `continue` &&
        t !== `input` &&
        t !== `__proto__` &&
        (s[t] = e[t])
    return ((s.path ??= []), (s.message = o), t?.reportInput && (s.input = e.input), s)
  }
  let Ve = /[\uD800-\uDBFF]/
  function He(e) {
    let t = e.length
    if (!Ve.test(e)) return t
    let n = t
    for (let r = 0; r < t - 1; r++)
      (e.charCodeAt(r) & 64512) == 55296 && (e.charCodeAt(r + 1) & 64512) == 56320 && (n--, r++)
    return n
  }
  function Ue(e) {
    return Array.isArray(e) ? `array` : typeof e == `string` ? `string` : `unknown`
  }
  function We(e) {
    let t = typeof e
    switch (t) {
      case `number`:
        return Number.isNaN(e) ? `nan` : `number`
      case `object`: {
        if (e === null) return `null`
        if (Array.isArray(e)) return `array`
        let t = e
        if (
          t &&
          Object.getPrototypeOf(t) !== Object.prototype &&
          `constructor` in t &&
          t.constructor
        )
          return t.constructor.name
      }
    }
    return t
  }
  function Ge(...e) {
    let [t, n, r] = e
    return typeof t == `string` ? { message: t, code: `custom`, input: n, inst: r } : { ...t }
  }
  function Ke(e, t) {
    for (let n in t) {
      let r = Object.getOwnPropertyDescriptor(t, n)
      r.get ? Object.defineProperty(e, n, { ...r, enumerable: !1 }) : Ye(e, n, r.value)
    }
  }
  function E(e, t, n, r = !0) {
    return (
      Object.defineProperty(e, t, { configurable: !0, writable: !0, enumerable: r, value: n }), n
    )
  }
  function qe(e, t, n) {
    return E(e, t, n, !1)
  }
  function Je(e, t) {
    for (let n in e) {
      let r = e[n]
      Object.defineProperty(t, n, {
        configurable: !0,
        enumerable: !0,
        get() {
          return E(this, n, r(this))
        },
        set(e) {
          E(this, n, e)
        },
      })
    }
    return t
  }
  function Ye(e, t, n) {
    Object.defineProperty(e, t, {
      configurable: !0,
      get() {
        return this == null ? n : E(this, t, n.bind(this))
      },
      set(e) {
        E(this, t, e)
      },
    })
  }
  function Xe(e, t) {
    let n = Object.getPrototypeOf(e)
    return t in n ? void 0 : n
  }
  let Ze,
    D = !1,
    Qe = {
      configurable: !0,
      get() {
        D = !0
      },
    }
  function O(e, t, n) {
    let r = Object.getPrototypeOf(e._zod)
    t in r && Ze !== e._zod
      ? (Ze = void 0)
      : ((Ze = e._zod),
        Object.defineProperty(r, t, {
          configurable: !0,
          get() {
            Object.defineProperty(this, t, Qe)
            let e = D
            D = !1
            try {
              let r = n(this)
              return (
                D
                  ? delete this[t]
                  : Object.defineProperty(this, t, { configurable: !0, writable: !0, value: r }),
                (D ||= e),
                r
              )
            } catch (n) {
              throw (delete this[t], (D ||= e), n)
            }
          },
          set(e) {
            Object.defineProperty(this, t, { configurable: !0, writable: !0, value: e })
          },
        }))
  }
  function $e(e, t, n, r) {
    let i = Xe(e, t)
    i &&
      Object.defineProperty(i, t, {
        configurable: !0,
        get() {
          let e = { configurable: !0, writable: !0, enumerable: r, value: void 0 }
          return (
            Object.defineProperty(this, t, e),
            (e.value = n(this)),
            Object.defineProperty(this, t, e),
            e.value
          )
        },
        set(e) {
          Object.defineProperty(this, t, {
            configurable: !0,
            writable: !0,
            enumerable: r,
            value: e,
          })
        },
      })
  }
  function et(e) {
    let t = () => e
    return ((t[`~constantCatch`] = !0), t)
  }
  var tt
  let nt = { value: void 0, enumerable: !1 },
    rt = `captureStackTrace` in Error ? Error : null
  function it(e) {
    let t = rt
    if (t) {
      let n = t.stackTraceLimit
      if (typeof n == `number`) {
        try {
          t.stackTraceLimit = 0
        } catch {
          return ((rt = null), new e())
        }
        try {
          return new e()
        } finally {
          t.stackTraceLimit = n
        }
      }
    }
    return new e()
  }
  function k(e, t, n, r) {
    let i = {}
    function a(e) {
      ;((this.def = e), (this.constr = d), (this.traits = /* @__PURE__ */ new Set()))
    }
    a.prototype = i
    let o = n,
      s = o && /* @__PURE__ */ new WeakSet()
    function c(n, r) {
      if (!n._zod) {
        nt.value = new a(r)
        try {
          Object.defineProperty(n, '_zod', nt)
        } finally {
          nt.value = void 0
        }
      } else if (n._zod.traits.has(e)) return
      if ((n._zod.traits.add(e), t(n, r), s)) {
        let e = Object.getPrototypeOf(n),
          t = n._zod.constr.prototype,
          r = e
        for (; r && r !== t;) r = Object.getPrototypeOf(r)
        let i = r ?? e
        s.has(i) || (s.add(i), Ke(i, o))
      }
      let i = d.prototype
      for (let e in i)
        Object.prototype.hasOwnProperty.call(i, e) && (e in n || (n[e] = i[e].bind(n)))
    }
    let l = r?.Parent ?? Object
    class u extends l {}
    Object.defineProperty(u, 'name', { value: e })
    function d(e) {
      let t = r?.Parent ? it(u) : this
      c(t, e)
      let n = t._zod.deferred
      if (n) {
        for (let e of n) e()
        t._zod.deferred = void 0
      }
      let i = globalThis.__zod_globalConfig?.postProcessor
      return (i && i(t), t)
    }
    return (
      Object.defineProperty(d, 'init', { value: c }),
      Object.defineProperty(d, Symbol.hasInstance, {
        value: (t) => (r?.Parent && t instanceof r.Parent ? !0 : t?._zod?.traits?.has(e)),
      }),
      Object.defineProperty(d, 'name', { value: e }),
      d
    )
  }
  var A = class extends Error {
      constructor() {
        super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`)
      }
    },
    at = class extends Error {
      constructor(e) {
        ;(super(`Encountered unidirectional transform during encode: ${e}`),
          (this.name = `ZodEncodeError`))
      }
    }
  ;(tt = globalThis).__zod_globalConfig ?? (tt.__zod_globalConfig = {})
  let j = globalThis.__zod_globalConfig
  function M(e) {
    return (e && Object.assign(j, e), j)
  }
  function ot() {
    let e = this._zod
    return ((e.message ??= JSON.stringify(e.def, se, 2)), e.message)
  }
  function st(e) {
    this._zod.message = e
  }
  let ct = { get: ot, set: st, enumerable: !0, configurable: !0 },
    lt = { value: void 0, enumerable: !1 },
    ut = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]),
    dt = (e, t) => {
      ;((e.name = `$ZodError`),
        (lt.value = t),
        Object.defineProperty(e, 'issues', lt),
        (lt.value = void 0),
        Object.defineProperty(e, 'message', ct))
      let n = Object.getPrototypeOf(e)
      ut.has(n) ||
        (ut.add(n),
        Object.defineProperty(n, 'toString', {
          configurable: !0,
          enumerable: !1,
          get() {
            let e = () => this.message
            return (
              Object.defineProperty(this, 'toString', { value: e, configurable: !0, writable: !0 }),
              e
            )
          },
          set(e) {
            Object.defineProperty(this, 'toString', { value: e, configurable: !0, writable: !0 })
          },
        }))
    },
    ft = k(`$ZodError`, dt)
  k(`$ZodError`, dt, void 0, { Parent: Error })
  function pt(e, t, n) {
    return (
      Object.prototype.hasOwnProperty.call(e, t) ||
        (t === `__proto__`
          ? Object.defineProperty(e, t, {
              value: n(),
              writable: !0,
              enumerable: !0,
              configurable: !0,
            })
          : (e[t] = n())),
      e[t]
    )
  }
  function mt(e, t = (e) => e.message) {
    let n = {},
      r = []
    for (let i of e.issues) i.path.length > 0 ? pt(n, i.path[0], () => []).push(t(i)) : r.push(t(i))
    return { formErrors: r, fieldErrors: n }
  }
  function ht(e, t = (e) => e.message) {
    let n = { _errors: [] },
      r = (e, i = []) => {
        for (let a of e.issues)
          if (a.code === `invalid_union` && a.errors.length)
            a.errors.map((e) => r({ issues: e }, [...i, ...a.path]))
          else if (a.code === `invalid_key`) r({ issues: a.issues }, [...i, ...a.path])
          else if (a.code === `invalid_element`) r({ issues: a.issues }, [...i, ...a.path])
          else {
            let e = [...i, ...a.path]
            if (e.length === 0) n._errors.push(t(a))
            else {
              let r = n,
                i = 0
              for (; i < e.length;) {
                let n = e[i],
                  o = i === e.length - 1
                if (n === `_errors`) {
                  ;(o && r._errors.push(t(a)), i++)
                  continue
                }
                Object.prototype.hasOwnProperty.call(r, n) ||
                  Object.defineProperty(r, n, {
                    value: { _errors: [] },
                    enumerable: !0,
                    writable: !0,
                    configurable: !0,
                  })
                let s = r[n]
                ;(o && s._errors.push(t(a)), (r = s), i++)
              }
            }
          }
      }
    return (r(e), n)
  }
  function gt(e, t) {
    return { callee: t?.callee ?? e, Err: t?.Err }
  }
  let _t = (e) => {
      let t = (n, r, i, a) => {
        let o = i ? { ...i, async: !1 } : { async: !1 },
          s = n._zod.run({ value: r, issues: [] }, o)
        if (s instanceof Promise) throw new A()
        if (s.issues.length) {
          let n = new (a?.Err ?? e)(s.issues.map((e) => T(e, o, M())))
          throw (_e(n, a?.callee ?? t), n)
        }
        return s.value
      }
      return t
    },
    vt = (e) => {
      let t = async (n, r, i, a) => {
        let o = i ? { ...i, async: !0 } : { async: !0 },
          s = n._zod.run({ value: r, issues: [] }, o)
        if ((s instanceof Promise && (s = await s), s.issues.length)) {
          let n = new (a?.Err ?? e)(s.issues.map((e) => T(e, o, M())))
          throw (_e(n, a?.callee ?? t), n)
        }
        return s.value
      }
      return t
    },
    yt = (e) => (t, n, r) => {
      let i = r ? { ...r, async: !1 } : { async: !1 },
        a = t._zod.run({ value: n, issues: [] }, i)
      if (a instanceof Promise) throw new A()
      return a.issues.length ? bt(e, a.issues, i) : { success: !0, data: a.value }
    }
  function bt(e, t, n) {
    let r
    return {
      success: !1,
      get error() {
        return (r || ((r = new e(t.map((e) => T(e, n, M())))), (t = void 0), (n = void 0)), r)
      },
      set error(e) {
        ;((r = e), (t = void 0), (n = void 0))
      },
    }
  }
  let xt = (e) => async (t, n, r) => {
      let i = r ? { ...r, async: !0 } : { async: !0 },
        a = t._zod.run({ value: n, issues: [] }, i)
      return (
        a instanceof Promise && (a = await a),
        a.issues.length ? bt(e, a.issues, i) : { success: !0, data: a.value }
      )
    },
    St = /* @__PURE__ */ Symbol.for(`zod.compile.invalid`),
    Ct = /* @__PURE__ */ Symbol.for(`zod.compile.fallback`),
    wt = (e, t, n) => {
      let r = e._zod.bag.validator
      if (r !== void 0) {
        if (r(t) !== St) return !0
        if (r.definite === !0 && n === void 0) return !1
      }
      return Tt(e, t, n)
    }
  function Tt(e, t, n) {
    let r = n ? { ...n, async: !1, abortEarly: !0 } : { async: !1, abortEarly: !0 },
      i = e._zod.bag.fallbackRun,
      a
    if (
      (i
        ? ((r[Ct] = !0), (a = i({ value: t, issues: [] }, r)))
        : (a = e._zod.run({ value: t, issues: [] }, r)),
      a instanceof Promise)
    )
      throw new A()
    return a.issues.length === 0
  }
  let Et = async (e, t, n) => {
      let r = n ? { ...n, async: !0, abortEarly: !0 } : { async: !0, abortEarly: !0 },
        i = e._zod.run({ value: t, issues: [] }, r)
      return (i instanceof Promise && (i = await i), i.issues.length === 0)
    },
    Dt = (e) => {
      let t = _t(e),
        n = (e, r, i, a) => {
          let o = i ? { ...i, direction: `backward` } : { direction: `backward` }
          return t(e, r, o, gt(n, a))
        }
      return n
    },
    Ot = (e) => {
      let t = _t(e),
        n = (e, r, i, a) => t(e, r, i, gt(n, a))
      return n
    },
    kt = (e) => {
      let t = vt(e),
        n = async (e, r, i, a) => {
          let o = i ? { ...i, direction: `backward` } : { direction: `backward` }
          return await t(e, r, o, gt(n, a))
        }
      return n
    },
    At = (e) => {
      let t = vt(e),
        n = async (e, r, i, a) => await t(e, r, i, gt(n, a))
      return n
    },
    jt = (e) => (t, n, r) => {
      let i = r ? { ...r, direction: `backward` } : { direction: `backward` }
      return yt(e)(t, n, i)
    },
    Mt = (e) => (t, n, r) => yt(e)(t, n, r),
    Nt = (e) => async (t, n, r) => {
      let i = r ? { ...r, direction: `backward` } : { direction: `backward` }
      return xt(e)(t, n, i)
    },
    Pt = (e) => async (t, n, r) => xt(e)(t, n, r),
    Ft = /^[cC][0-9a-z]{6,}$/,
    It = /^[0-9a-z]+$/,
    Lt = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/,
    Rt = /^[0-9a-vA-V]{20}$/,
    zt = /^[A-Za-z0-9]{27}$/,
    Bt = /^[a-zA-Z0-9_-]{21}$/
  function Vt(e) {
    return RegExp(`^[a-zA-Z0-9_-]{${e}}$`)
  }
  let Ht =
      /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/,
    Ut = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,
    Wt = (e) =>
      e
        ? RegExp(
            `^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${e}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`,
          )
        : /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/,
    Gt =
      /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/
  function Kt() {
    return /* @__PURE__ */ RegExp(
      `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`,
      `u`,
    )
  }
  let qt =
      /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
    Jt =
      /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/,
    Yt =
      /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/,
    Xt =
      /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
    Zt = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/,
    Qt = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/,
    $t = /^https?$/,
    en = /^\+[1-9]\d{6,14}$/,
    tn = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`
  function nn(e) {
    return RegExp(`^${e}$`)
  }
  let rn = /*@__PURE__*/ nn(tn)
  function an(e) {
    let t = `(?:[01]\\d|2[0-3]):[0-5]\\d`
    return typeof e.precision == `number`
      ? e.precision === -1
        ? `${t}`
        : e.precision === 0
          ? `${t}:[0-5]\\d`
          : `${t}:[0-5]\\d\\.\\d{${e.precision}}`
      : e.seconds
        ? `${t}:[0-5]\\d(?:\\.\\d+)?`
        : `${t}(?::[0-5]\\d(?:\\.\\d+)?)?`
  }
  function on(e) {
    return RegExp(`^${an(e)}$`)
  }
  function sn(e) {
    let t = [`Z`]
    e.offset && t.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`)
    let n = `${an({ precision: e.precision, seconds: !0 })}(?:${t.join(`|`)})`,
      r = e.local ? `${n}|${an({ precision: e.precision })}` : n
    return RegExp(`^${tn}T(?:${r})$`)
  }
  let cn = /^[\s\S]{0,}$/,
    ln = /^-?\d+(?:\.\d+)?$/,
    un = /^(?:true|false)$/i,
    dn = /^[^A-Z]*$/,
    fn = /^[^a-z]*$/,
    N = /*@__PURE__*/ k(`$ZodCheck`, (e, t) => {
      var n
      ;((e._zod ??= {}), (e._zod.def = t), (n = e._zod).onattach ?? (n.onattach = []))
    }),
    pn = (e) => {
      let t = e.value
      return !le(t) && t.length !== void 0
    },
    mn = { number: `number`, bigint: `bigint`, object: `date` },
    hn = /*@__PURE__*/ k(`$ZodCheckLessThan`, (e, t) => {
      N.init(e, t)
      let n = mn[typeof t.value]
      e._zod.check = (r) => {
        ;(t.inclusive ? r.value <= t.value : r.value < t.value) ||
          r.issues.push({
            origin: mn[typeof r.value] ?? n,
            code: `too_big`,
            maximum: typeof t.value == `object` ? t.value.getTime() : t.value,
            input: r.value,
            inclusive: t.inclusive,
            inst: e,
            continue: !t.abort,
          })
      }
    }),
    gn = /*@__PURE__*/ k(`$ZodCheckGreaterThan`, (e, t) => {
      N.init(e, t)
      let n = mn[typeof t.value]
      e._zod.check = (r) => {
        ;(t.inclusive ? r.value >= t.value : r.value > t.value) ||
          r.issues.push({
            origin: mn[typeof r.value] ?? n,
            code: `too_small`,
            minimum: typeof t.value == `object` ? t.value.getTime() : t.value,
            input: r.value,
            inclusive: t.inclusive,
            inst: e,
            continue: !t.abort,
          })
      }
    }),
    _n = /*@__PURE__*/ k(`$ZodCheckMultipleOf`, (e, t) => {
      ;(N.init(e, t),
        (e._zod.check = (n) => {
          if (typeof n.value != typeof t.value)
            throw Error(`Cannot mix number and bigint in multiple_of check.`)
          ;(typeof n.value == `bigint`
            ? t.value !== BigInt(0) && n.value % t.value === BigInt(0)
            : de(n.value, t.value) === 0) ||
            n.issues.push({
              origin: typeof n.value,
              code: `not_multiple_of`,
              divisor: t.value,
              input: n.value,
              inst: e,
              continue: !t.abort,
            })
        }))
    }),
    vn = /*@__PURE__*/ k(`$ZodCheckNumberFormat`, (e, t) => {
      ;(N.init(e, t), (t.format = t.format || `float64`))
      let n = t.format?.includes(`int`),
        r = n ? `int` : `number`,
        [i, a] = Te[t.format]
      e._zod.check = (o) => {
        let s = o.value
        if (n) {
          if (!Number.isInteger(s)) {
            o.issues.push({
              expected: r,
              format: t.format,
              code: `invalid_type`,
              continue: !1,
              input: s,
              inst: e,
            })
            return
          }
          if (!Number.isSafeInteger(s)) {
            s > 0
              ? o.issues.push({
                  input: s,
                  code: `too_big`,
                  maximum: 2 ** 53 - 1,
                  note: `Integers must be within the safe integer range.`,
                  inst: e,
                  origin: r,
                  inclusive: !0,
                  continue: !t.abort,
                })
              : o.issues.push({
                  input: s,
                  code: `too_small`,
                  minimum: -(2 ** 53 - 1),
                  note: `Integers must be within the safe integer range.`,
                  inst: e,
                  origin: r,
                  inclusive: !0,
                  continue: !t.abort,
                })
            return
          }
        }
        ;(s < i &&
          o.issues.push({
            origin: `number`,
            input: s,
            code: `too_small`,
            minimum: i,
            inclusive: !0,
            inst: e,
            continue: !t.abort,
          }),
          s > a &&
            o.issues.push({
              origin: `number`,
              input: s,
              code: `too_big`,
              maximum: a,
              inclusive: !0,
              inst: e,
              continue: !t.abort,
            }))
      }
    }),
    yn = /*@__PURE__*/ k(`$ZodCheckMaxLength`, (e, t) => {
      var n
      ;(N.init(e, t),
        (n = e._zod.def).when ?? (n.when = pn),
        (e._zod.check = (n) => {
          let r = n.value,
            i = r.length
          if ((typeof r == `string` && i > t.maximum ? He(r) : i) <= t.maximum) return
          let a = Ue(r)
          n.issues.push({
            origin: a,
            code: `too_big`,
            maximum: t.maximum,
            inclusive: !0,
            input: r,
            inst: e,
            continue: !t.abort,
          })
        }))
    }),
    bn = /*@__PURE__*/ k(`$ZodCheckMinLength`, (e, t) => {
      var n
      ;(N.init(e, t),
        (n = e._zod.def).when ?? (n.when = pn),
        (e._zod.check = (n) => {
          let r = n.value,
            i = r.length
          if (
            (typeof r == `string` && i >= t.minimum && i < t.minimum * 2 ? He(r) : i) >= t.minimum
          )
            return
          let a = Ue(r)
          n.issues.push({
            origin: a,
            code: `too_small`,
            minimum: t.minimum,
            inclusive: !0,
            input: r,
            inst: e,
            continue: !t.abort,
          })
        }))
    }),
    xn = /*@__PURE__*/ k(`$ZodCheckLengthEquals`, (e, t) => {
      var n
      ;(N.init(e, t),
        (n = e._zod.def).when ?? (n.when = pn),
        (e._zod.check = (n) => {
          let r = n.value,
            i = r.length,
            a = typeof r == `string` && i >= t.length && i <= t.length * 2 ? He(r) : i
          if (a === t.length) return
          let o = Ue(r),
            s = a > t.length
          n.issues.push({
            origin: o,
            ...(s
              ? { code: `too_big`, maximum: t.length }
              : { code: `too_small`, minimum: t.length }),
            inclusive: !0,
            exact: !0,
            input: n.value,
            inst: e,
            continue: !t.abort,
          })
        }))
    }),
    Sn = /*@__PURE__*/ k(`$ZodCheckStringFormat`, (e, t) => {
      var n, r
      ;(N.init(e, t),
        t.pattern
          ? ((n = e._zod).check ??
            (n.check = (n) => {
              ;((t.pattern.lastIndex = 0),
                !t.pattern.test(n.value) &&
                  n.issues.push({
                    origin: `string`,
                    code: `invalid_format`,
                    format: t.format,
                    input: n.value,
                    ...(t.pattern ? { pattern: t.pattern.toString() } : {}),
                    inst: e,
                    continue: !t.abort,
                  }))
            }))
          : ((r = e._zod).check ?? (r.check = () => {})))
    }),
    Cn = /*@__PURE__*/ k(`$ZodCheckRegex`, (e, t) => {
      ;(Sn.init(e, t),
        (e._zod.check = (n) => {
          ;((t.pattern.lastIndex = 0),
            !t.pattern.test(n.value) &&
              n.issues.push({
                origin: `string`,
                code: `invalid_format`,
                format: `regex`,
                input: n.value,
                pattern: t.pattern.toString(),
                inst: e,
                continue: !t.abort,
              }))
        }))
    }),
    wn = /*@__PURE__*/ k(`$ZodCheckLowerCase`, (e, t) => {
      ;((t.pattern ??= dn), Sn.init(e, t))
    }),
    Tn = /*@__PURE__*/ k(`$ZodCheckUpperCase`, (e, t) => {
      ;((t.pattern ??= fn), Sn.init(e, t))
    }),
    En = /*@__PURE__*/ k(`$ZodCheckIncludes`, (e, t) => {
      N.init(e, t)
      let n = x(t.includes)
      ;((t.pattern = new RegExp(typeof t.position == `number` ? `^.{${t.position},}${n}` : n)),
        (e._zod.check = (n) => {
          n.value.includes(t.includes, t.position) ||
            n.issues.push({
              origin: `string`,
              code: `invalid_format`,
              format: `includes`,
              includes: t.includes,
              input: n.value,
              inst: e,
              continue: !t.abort,
            })
        }))
    }),
    Dn = /*@__PURE__*/ k(`$ZodCheckStartsWith`, (e, t) => {
      N.init(e, t)
      let n = RegExp(`^${x(t.prefix)}.*`)
      ;((t.pattern ??= n),
        (e._zod.check = (n) => {
          n.value.startsWith(t.prefix) ||
            n.issues.push({
              origin: `string`,
              code: `invalid_format`,
              format: `starts_with`,
              prefix: t.prefix,
              input: n.value,
              inst: e,
              continue: !t.abort,
            })
        }))
    }),
    On = /*@__PURE__*/ k(`$ZodCheckEndsWith`, (e, t) => {
      N.init(e, t)
      let n = RegExp(`.*${x(t.suffix)}$`)
      ;((t.pattern ??= n),
        (e._zod.check = (n) => {
          n.value.endsWith(t.suffix) ||
            n.issues.push({
              origin: `string`,
              code: `invalid_format`,
              format: `ends_with`,
              suffix: t.suffix,
              input: n.value,
              inst: e,
              continue: !t.abort,
            })
        }))
    }),
    kn = /*@__PURE__*/ k(`$ZodCheckOverwrite`, (e, t) => {
      ;(N.init(e, t),
        (e._zod.check = (e) => {
          e.value = t.tx(e.value)
        }))
    })
  var An = class {
    constructor(e = [], t = {}) {
      ;((this.content = []), (this.indent = 0), (this.args = e), (this.closed = t))
    }
    indented(e) {
      this.indent += 1
      try {
        e(this)
      } finally {
        --this.indent
      }
    }
    write(e) {
      if (typeof e == `function`) {
        ;(e(this, { execution: `sync` }), e(this, { execution: `async` }))
        return
      }
      let t = e
          .split(`
`)
          .filter((e) => e),
        n = Math.min(...t.map((e) => e.length - e.trimStart().length)),
        r = t.map((e) => e.slice(n)).map((e) => ` `.repeat(this.indent * 2) + e)
      for (let e of r) this.content.push(e)
    }
    compile() {
      let e = Function,
        t = this?.content ?? [``]
      return new e(
        ...Object.keys(this.closed),
        `return function (${this.args.join(`, `)}) {\n${t.join(`
`)}\n};`,
      )(...Object.values(this.closed))
    }
  }
  let jn = { major: 4, minor: 6, patch: 6 },
    P = /*@__PURE__*/ k(
      `$ZodType`,
      (e, t) => {
        var n
        ;((e ??= {}), (e._zod.def = t), (e._zod.bag = e._zod.bag || {}), (e._zod.version = jn))
        let r = e._zod.def.checks,
          i = e._zod.traits.has(`$ZodCheck`) ? [e, ...(r ?? [])] : r?.length ? [...r] : []
        for (let t of i) for (let n of t._zod.onattach) n(e)
        if (i.length === 0)
          ((n = e._zod).deferred ?? (n.deferred = []),
            e._zod.deferred?.push(() => {
              e._zod.run = e._zod.parse
            }))
        else {
          let t = (t, n, r) => {
              if (t.memo) return t
              let i = w(t),
                a
              for (let o of n) {
                if (o._zod.def.when) {
                  if (Ie(t) || !o._zod.def.when(t)) continue
                } else if (i) continue
                let n = t.issues.length,
                  s = o._zod.check(t)
                if (s instanceof Promise && r?.async === !1) throw new A()
                if (a || s instanceof Promise)
                  a = (a ?? Promise.resolve()).then(async () => {
                    ;(await s, t.issues.length !== n && (Be(t.issues, n, e), (i ||= w(t, n))))
                  })
                else {
                  if (t.issues.length === n) continue
                  ;(Be(t.issues, n, e), (i ||= w(t, n)))
                }
              }
              return a ? a.then(() => t) : t
            },
            n = (n, r, a) => {
              if (w(n)) return ((n.aborted = !0), n)
              let o = t(r, i, a)
              if (o instanceof Promise) {
                if (a.async === !1) throw new A()
                return o.then((t) => e._zod.parse(t, a))
              }
              return e._zod.parse(o, a)
            }
          e._zod.run = (r, a) => {
            if (a.skipChecks) return e._zod.parse(r, a)
            if (a.direction === `backward`) {
              let t = e._zod.parse({ value: r.value, issues: [] }, { ...a, skipChecks: !0 })
              return t instanceof Promise ? t.then((e) => n(e, r, a)) : n(t, r, a)
            }
            let o = e._zod.parse(r, a)
            if (o instanceof Promise) {
              if (a.async === !1) throw new A()
              return o.then((e) => t(e, i, a))
            }
            return t(o, i, a)
          }
        }
      },
      {
        get '~standard'() {
          return qe(this, `~standard`, Pn(this))
        },
        set '~standard'(e) {
          E(this, `~standard`, e)
        },
      },
    ),
    Mn = (e, t) =>
      e.issues.length ? { issues: e.issues.map((e) => T(e, t, M())) } : { value: e.value }
  async function Nn(e, t) {
    let n = { async: !0 }
    return Mn(await e._zod.run({ value: t, issues: [] }, n), n)
  }
  function Pn(e) {
    return {
      validate: (t) => {
        let n = { async: !1 }
        try {
          let r = e._zod.run({ value: t, issues: [] }, n)
          if (!(r instanceof Promise)) return Mn(r, n)
        } catch {}
        return Nn(e, t)
      },
      vendor: `zod`,
      version: 1,
    }
  }
  let Fn = /*@__PURE__*/ k(`$ZodString`, (e, t) => {
      ;(P.init(e, t),
        (e._zod.pattern = t.pattern ?? cn),
        (e._zod.parse = (n, r) => {
          if (t.coerce)
            try {
              n.value = String(n.value)
            } catch {}
          return (
            typeof n.value == `string` ||
              n.issues.push({ expected: `string`, code: `invalid_type`, input: n.value, inst: e }),
            n
          )
        }))
    }),
    F = /*@__PURE__*/ k(`$ZodStringFormat`, (e, t) => {
      ;(Sn.init(e, t), Fn.init(e, t))
    }),
    In = /*@__PURE__*/ k(`$ZodGUID`, (e, t) => {
      ;((t.pattern ??= Ut), F.init(e, t))
    }),
    Ln = /*@__PURE__*/ k(`$ZodUUID`, (e, t) => {
      if (t.version) {
        let e = { v1: 1, v2: 2, v3: 3, v4: 4, v5: 5, v6: 6, v7: 7, v8: 8 }[t.version]
        if (e === void 0) throw Error(`Invalid UUID version: "${t.version}"`)
        t.pattern ??= Wt(e)
      } else t.pattern ??= Wt()
      F.init(e, t)
    }),
    Rn = /*@__PURE__*/ k(`$ZodEmail`, (e, t) => {
      ;((t.pattern ??= Gt), F.init(e, t))
    })
  function zn(e) {
    try {
      return typeof URL < `u` && typeof URL.canParse == `function`
        ? URL.canParse(e)
        : (new URL(e), !0)
    } catch {
      return !1
    }
  }
  function Bn(e, t) {
    return !(`normalize` in t) && !(`hostname` in t) && !(`protocol` in t) ? zn(e) || 2 : Vn(e, t)
  }
  function Vn(e, t) {
    if (!t.normalize && t.protocol?.source === $t.source && !/^https?:\/\//i.test(e)) return 1
    try {
      if (typeof URL < `u`) {
        let t = URL
        if (typeof t.parse == `function`) return t.parse(e) ?? 2
      }
      return new URL(e)
    } catch {
      return 2
    }
  }
  let Hn = /[\t\n\r]/g
  function Un(e) {
    return e.replace(Hn, ``)
  }
  function Wn(e, t) {
    return ((t.lastIndex = 0), t.test(e.hostname))
  }
  function Gn(e, t) {
    return (
      (t.lastIndex = 0), t.test(e.protocol.endsWith(`:`) ? e.protocol.slice(0, -1) : e.protocol)
    )
  }
  let Kn = /*@__PURE__*/ k(`$ZodURL`, (e, t) => {
      ;(F.init(e, t),
        (e._zod.check = (n) => {
          try {
            let r = n.value.trim(),
              i = Bn(r, t)
            if (i === 1) {
              n.issues.push({
                code: `invalid_format`,
                format: `url`,
                note: `Invalid URL format`,
                input: n.value,
                inst: e,
                continue: !t.abort,
              })
              return
            }
            if (i === 2) {
              n.issues.push({
                code: `invalid_format`,
                format: `url`,
                input: n.value,
                inst: e,
                continue: !t.abort,
              })
              return
            }
            if (i === !0) {
              n.value = Un(r)
              return
            }
            ;(t.hostname &&
              !Wn(i, t.hostname) &&
              n.issues.push({
                code: `invalid_format`,
                format: `url`,
                note: `Invalid hostname`,
                pattern: t.hostname.source,
                input: n.value,
                inst: e,
                continue: !t.abort,
              }),
              t.protocol &&
                !Gn(i, t.protocol) &&
                n.issues.push({
                  code: `invalid_format`,
                  format: `url`,
                  note: `Invalid protocol`,
                  pattern: t.protocol.source,
                  input: n.value,
                  inst: e,
                  continue: !t.abort,
                }),
              (n.value = t.normalize ? i.href : Un(r)))
            return
          } catch {
            n.issues.push({
              code: `invalid_format`,
              format: `url`,
              input: n.value,
              inst: e,
              continue: !t.abort,
            })
          }
        }))
    }),
    qn = /*@__PURE__*/ k(`$ZodEmoji`, (e, t) => {
      ;((t.pattern ??= Kt()), F.init(e, t))
    }),
    Jn = /*@__PURE__*/ k(`$ZodNanoID`, (e, t) => {
      if (t.length !== void 0 && (!Number.isInteger(t.length) || t.length < 1))
        throw Error(`Invalid nanoid length: ${t.length}`)
      ;((t.pattern ??= t.length === void 0 ? Bt : Vt(t.length)), F.init(e, t))
    }),
    Yn = /*@__PURE__*/ k(`$ZodCUID`, (e, t) => {
      ;((t.pattern ??= Ft), F.init(e, t))
    }),
    Xn = /*@__PURE__*/ k(`$ZodCUID2`, (e, t) => {
      ;((t.pattern ??= It), F.init(e, t))
    }),
    Zn = /*@__PURE__*/ k(`$ZodULID`, (e, t) => {
      ;((t.pattern ??= Lt), F.init(e, t))
    }),
    Qn = /*@__PURE__*/ k(`$ZodXID`, (e, t) => {
      ;((t.pattern ??= Rt), F.init(e, t))
    }),
    $n = /*@__PURE__*/ k(`$ZodKSUID`, (e, t) => {
      ;((t.pattern ??= zt), F.init(e, t))
    }),
    er = /*@__PURE__*/ k(`$ZodISODateTime`, (e, t) => {
      ;((t.pattern ??= sn(t)), F.init(e, t))
    }),
    tr = /*@__PURE__*/ k(`$ZodISODate`, (e, t) => {
      ;((t.pattern ??= rn), F.init(e, t))
    }),
    nr = /*@__PURE__*/ k(`$ZodISOTime`, (e, t) => {
      ;((t.pattern ??= on(t)), F.init(e, t))
    }),
    rr = /*@__PURE__*/ k(`$ZodISODuration`, (e, t) => {
      ;((t.pattern ??= Ht), F.init(e, t))
    }),
    ir = /*@__PURE__*/ k(`$ZodIPv4`, (e, t) => {
      ;((t.pattern ??= qt), F.init(e, t))
    }),
    ar = /^[0-9a-fA-F:.]+$/
  function or(e) {
    return ar.test(e) ? zn(`http://[${e}]`) : !1
  }
  let sr = /*@__PURE__*/ k(`$ZodIPv6`, (e, t) => {
      ;((t.pattern ??= Jt),
        F.init(e, t),
        (e._zod.check = (n) => {
          or(n.value) ||
            n.issues.push({
              code: `invalid_format`,
              format: `ipv6`,
              input: n.value,
              inst: e,
              continue: !t.abort,
            })
        }))
    }),
    cr = /*@__PURE__*/ k(`$ZodCIDRv4`, (e, t) => {
      ;((t.pattern ??= Yt), F.init(e, t))
    })
  function lr(e) {
    let t = e.split(`/`)
    if (t.length !== 2) return !1
    let [n, r] = t
    if (!r) return !1
    let i = Number(r)
    return `${i}` !== r || i < 0 || i > 128 ? !1 : or(n)
  }
  let ur = /*@__PURE__*/ k(`$ZodCIDRv6`, (e, t) => {
    ;((t.pattern ??= Xt),
      F.init(e, t),
      (e._zod.check = (n) => {
        lr(n.value) ||
          n.issues.push({
            code: `invalid_format`,
            format: `cidrv6`,
            input: n.value,
            inst: e,
            continue: !t.abort,
          })
      }))
  })
  function dr(e) {
    if (e === ``) return !0
    if (/\s/.test(e) || e.length % 4 != 0) return !1
    try {
      return (atob(e), !0)
    } catch {
      return !1
    }
  }
  let fr = /^[0-9a-zA-Z+/]*={0,2}$/,
    pr = /*@__PURE__*/ k(`$ZodBase64`, (e, t) => {
      ;((t.pattern ??= fr),
        F.init(e, t),
        (e._zod.check = (n) => {
          dr(n.value) ||
            n.issues.push({
              code: `invalid_format`,
              format: `base64`,
              input: n.value,
              inst: e,
              continue: !t.abort,
            })
        }))
    }),
    mr = /^[A-Za-z0-9_-]*$/
  function hr(e) {
    if (!mr.test(e)) return !1
    let t = e.replace(/[-_]/g, (e) => (e === `-` ? `+` : `/`))
    return dr(t.padEnd(Math.ceil(t.length / 4) * 4, `=`))
  }
  let gr = /*@__PURE__*/ k(`$ZodBase64URL`, (e, t) => {
      ;((t.pattern ??= mr),
        F.init(e, t),
        (e._zod.check = (n) => {
          hr(n.value) ||
            n.issues.push({
              code: `invalid_format`,
              format: `base64url`,
              input: n.value,
              inst: e,
              continue: !t.abort,
            })
        }))
    }),
    _r = /*@__PURE__*/ k(`$ZodE164`, (e, t) => {
      ;((t.pattern ??= en), F.init(e, t))
    })
  function vr(e, t = null) {
    try {
      let n = e.split(`.`)
      if (n.length !== 3) return !1
      let [r] = n
      if (!r) return !1
      let i = JSON.parse(atob(r))
      return !((`typ` in i && i?.typ !== `JWT`) || !i.alg || (t && (!(`alg` in i) || i.alg !== t)))
    } catch {
      return !1
    }
  }
  let yr = /*@__PURE__*/ k(`$ZodJWT`, (e, t) => {
      ;(F.init(e, t),
        (e._zod.check = (n) => {
          vr(n.value, t.alg) ||
            n.issues.push({
              code: `invalid_format`,
              format: `jwt`,
              input: n.value,
              inst: e,
              continue: !t.abort,
            })
        }))
    }),
    br = /*@__PURE__*/ k(`$ZodNumber`, (e, t) => {
      ;(P.init(e, t),
        (e._zod.pattern = ln),
        (e._zod.parse = (n, r) => {
          if (t.coerce)
            try {
              n.value = Number(n.value)
            } catch {}
          let i = n.value
          if (typeof i == `number` && !Number.isNaN(i) && Number.isFinite(i)) return n
          let a =
            typeof i == `number`
              ? Number.isNaN(i)
                ? `NaN`
                : Number.isFinite(i)
                  ? void 0
                  : String(i)
              : void 0
          return (
            n.issues.push({
              expected: `number`,
              code: `invalid_type`,
              input: i,
              inst: e,
              ...(a ? { received: a } : {}),
            }),
            n
          )
        }))
    }),
    xr = /*@__PURE__*/ k(`$ZodNumberFormat`, (e, t) => {
      ;(vn.init(e, t), br.init(e, t))
    }),
    Sr = /*@__PURE__*/ k(`$ZodBoolean`, (e, t) => {
      ;(P.init(e, t),
        (e._zod.pattern = un),
        (e._zod.parse = (n, r) => {
          if (t.coerce)
            try {
              n.value = !!n.value
            } catch {}
          let i = n.value
          return (
            typeof i == `boolean` ||
              n.issues.push({ expected: `boolean`, code: `invalid_type`, input: i, inst: e }),
            n
          )
        }))
    }),
    Cr = /*@__PURE__*/ k(`$ZodUnknown`, (e, t) => {
      ;(P.init(e, t), (e._zod.parse = (e) => e))
    }),
    wr = /*@__PURE__*/ k(`$ZodNever`, (e, t) => {
      ;(P.init(e, t),
        (e._zod.parse = (t, n) => (
          t.issues.push({ expected: `never`, code: `invalid_type`, input: t.value, inst: e }),
          t
        )))
    })
  function Tr(e, t) {
    let n = ze(e._zod.def.checks)
    if (!n.length) return
    let r = Math.min(...n.map((e) => e[0])),
      i = e._zod.parse
    e._zod.parse = (n, a) => {
      let o = t(n.value)
      if (o > r && !a?.skipChecks && a?.direction !== `backward`) {
        for (let [t, r] of ze(e._zod.def.checks))
          if (o > t && r._zod.def.when(n)) {
            let t = n.issues.length
            return (r._zod.check(n), (n.issues[t].continue = !1), Be(n.issues, t, e), n)
          }
      }
      return i(n, a)
    }
  }
  let Er = (e) => (Array.isArray(e) ? e.length : -1)
  function Dr(e, t, n) {
    ;(e.issues.length && t.issues.push(...Le(n, e.issues)), (t.value[n] = e.value))
  }
  let Or = /*@__PURE__*/ k(`$ZodArray`, (e, t) => {
    P.init(e, t)
    let n = j.memoizer
    ;(n?.attach(e),
      (e._zod.parse = (r, i) => {
        let a = r.value
        if (!Array.isArray(a))
          return (r.issues.push({ expected: `array`, code: `invalid_type`, input: a, inst: e }), r)
        r.value = n ? n.alloc(e, r, Array(a.length), i) : Array(a.length)
        let o = [],
          s = i?.abortEarly
        for (let e = 0; e < a.length; e++) {
          let n = a[e],
            c = t.element._zod.run({ value: n, issues: [] }, i)
          if (c instanceof Promise) o.push(c.then((t) => Dr(t, r, e)))
          else if ((Dr(c, r, e), s && c.issues.length !== 0 && w(c))) break
        }
        return o.length ? Promise.all(o).then(() => r) : r
      }),
      Tr(e, Er))
  })
  function kr(e, t, n, r, i, a) {
    let o = n in r,
      s = a === `optional`
    if (o || !s || i !== `optional`) {
      if (e.issues.length) {
        if (i !== void 0 && s && !o) return
        t.issues.push(...Le(n, e.issues))
      }
      !o && i === void 0
        ? e.issues.length ||
          t.issues.push({ code: `invalid_type`, expected: `nonoptional`, input: void 0, path: [n] })
        : e.value === void 0
          ? (o || (i === `defaulted` && !s)) && (t.value[n] = void 0)
          : (t.value[n] = e.value)
    }
  }
  let Ar = []
  function jr(e) {
    let t = Object.keys(e.shape),
      n = Object.getOwnPropertySymbols(e.shape),
      r = n.length ? n : Ar,
      i = r.length ? [...t, ...r] : t
    for (let t of i)
      if (!e.shape?.[t]?._zod?.traits?.has(`$ZodType`))
        throw Error(`Invalid element at key "${String(t)}": expected a Zod schema`)
    let a = we(e.shape)
    return {
      ...e,
      allKeys: i,
      symbolKeys: r,
      keySet: new Set(t),
      numKeys: t.length,
      optionalKeys: new Set(a),
    }
  }
  function Mr(e, t, n, r, i, a, o) {
    let s = [],
      c = i.keySet,
      l = i.catchall._zod,
      u = l.def.type,
      d = l.optin,
      f = l.optout,
      p = 0
    for (let i in t) {
      if (o && n.issues.length !== p) {
        if (w(n, p)) break
        p = n.issues.length
      }
      if (c.has(i)) continue
      if (i === `__proto__`) {
        u === `never` && s.push(i)
        continue
      }
      if (u === `never`) {
        s.push(i)
        continue
      }
      let a = l.run({ value: t[i], issues: [] }, r)
      a instanceof Promise ? e.push(a.then((e) => kr(e, n, i, t, d, f))) : kr(a, n, i, t, d, f)
    }
    return (
      s.length &&
        n.issues.push({ code: `unrecognized_keys`, keys: s, input: t, inst: a, continue: !0 }),
      e.length ? Promise.all(e).then(() => n) : n
    )
  }
  let Nr = /*@__PURE__*/ k(`$ZodObject`, (e, t) => {
      P.init(e, t)
      let n = Object.getOwnPropertyDescriptor(t, `shape`),
        r = n?.get ? n.get.raw : (t.shape ?? {})
      if (r) {
        let e = () => {
          let n = { ...r }
          return (Object.defineProperty(t, 'shape', { value: n }), (e.raw = n), n)
        }
        ;((e.raw = r), Object.defineProperty(t, 'shape', { get: e }))
      }
      let i = h(() => jr(t))
      O(e, `propValues`, (e) => {
        let t = e.def.shape,
          n = {}
        for (let e in t) {
          let r = t[e]._zod
          if (r.values) {
            Object.prototype.hasOwnProperty.call(n, e) || g(n, e, /* @__PURE__ */ new Set())
            for (let t of r.values) n[e].add(t)
            r.optin !== void 0 && n[e].add(void 0)
          }
        }
        return n
      })
      let a = ve,
        o = t.catchall,
        s,
        c = j.memoizer
      ;(c?.attach(e),
        (e._zod.parse = (t, n) => {
          s ??= i.value
          let r = t.value
          if (!a(r))
            return (
              t.issues.push({ expected: `object`, code: `invalid_type`, input: r, inst: e }), t
            )
          t.value = c ? c.alloc(e, t, {}, n) : {}
          let l = [],
            u = s.shape,
            d = n?.abortEarly,
            f = t.issues.length
          for (let e of s.allKeys) {
            if (d && t.issues.length !== f) {
              if (w(t, f)) break
              f = t.issues.length
            }
            if (e === `__proto__`) continue
            let i = u[e],
              a = i._zod.optin,
              o = i._zod.optout,
              s = i._zod.run({ value: r[e], issues: [] }, n)
            s instanceof Promise
              ? l.push(s.then((n) => kr(n, t, e, r, a, o)))
              : kr(s, t, e, r, a, o)
          }
          return o
            ? Mr(l, r, t, n, i.value, e, d === !0)
            : l.length
              ? Promise.all(l).then(() => t)
              : t
        }))
    }),
    Pr = /*@__PURE__*/ k(`$ZodObjectJIT`, (e, t) => {
      Nr.init(e, t)
      let n = e._zod.parse,
        r = h(() => jr(t)),
        i = j.memoizer,
        a = (t) => {
          let n = r.value,
            a = n.symbolKeys,
            o = new An([`payload`, `ctx`], { shape: t, inst: e, memo: i, syms: a }),
            s = (e) => `shape[${e}]._zod.run({ value: input[${e}], issues: [] }, ctx)`,
            c = (e, t) => `
          let ${e}_ab = false;
          for (let i = 0; i < ${e}.issues.length; i++) {
            const iss = ${e}.issues[i];
            iss.path = iss.path ? [${t}, ...iss.path] : [${t}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${e}_ab = true;
          }
          if (${e}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`
          o.write(`const input = payload.value;`)
          let l = Object.create(null),
            u = 0
          for (let e of n.allKeys) l[e] = `key_${u++}`
          o.write(
            i ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`,
          )
          for (let e of n.allKeys) {
            if (e === `__proto__`) continue
            let n = l[e],
              r = typeof e == `symbol` ? `syms[${a.indexOf(e)}]` : he(e),
              i = `${r} in input`,
              u = t[e],
              d = u?._zod?.optin,
              f = d !== void 0,
              p = u?._zod?.optout === `optional`
            if ((o.write(`const ${n} = ${s(r)};`), f && p)) {
              let e = d === `optional` ? `${n}_present` : `${n}.value !== undefined || ${n}_present`
              o.write(`
        const ${n}_present = ${i};
        if (!${n}.issues.length || ${n}_present) {
          if (${n}.issues.length) {${c(n, r)}
          }

          if (${e}) {
            newResult[${r}] = ${n}.value;
          }
        }

      `)
            } else
              f
                ? (o.write(`
        if (${n}.issues.length) {${c(n, r)}
        }
      `),
                  d === `defaulted`
                    ? o.write(`newResult[${r}] = ${n}.value;`)
                    : o.write(`
        if (${n}.value !== undefined || ${i}) {
          newResult[${r}] = ${n}.value;
        }
      `))
                : o.write(`
        const ${n}_present = ${i};
        if (${n}.issues.length) {${c(n, r)}
        }
        if (!${n}_present && !${n}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${r}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${n}_present) {
          newResult[${r}] = ${n}.value;
        }

      `)
          }
          return (o.write(`payload.value = newResult;`), o.write(`return payload;`), o.compile())
        },
        o,
        s = ve,
        c = !j.jitless,
        l = c && ye.value,
        u = t.catchall,
        d
      e._zod.parse = (i, f) => {
        d ??= r.value
        let p = i.value
        return s(p)
          ? c && l && f?.async === !1 && f.jitless !== !0
            ? ((o ||= a(t.shape)),
              (i = o(i, f)),
              u ? Mr([], p, i, f, d, e, f?.abortEarly === !0) : i)
            : n(i, f)
          : (i.issues.push({ expected: `object`, code: `invalid_type`, input: p, inst: e }), i)
      }
    })
  function Fr(e, t, n, r) {
    for (let n of e) if (n.issues.length === 0) return ((t.value = n.value), t)
    let i = e.filter((e) => !w(e))
    return i.length === 1
      ? ((t.value = i[0].value), i[0])
      : (t.issues.push({
          code: `invalid_union`,
          input: t.value,
          inst: n,
          errors: e.map((e) => e.issues.map((e) => T(e, r, M()))),
        }),
        t)
  }
  let Ir = /*@__PURE__*/ k(`$ZodUnion`, (e, t) => {
    ;(P.init(e, t),
      O(e, `optin`, (e) =>
        e.def.options.some((e) => e._zod.optin === `defaulted`)
          ? `defaulted`
          : e.def.options.some((e) => e._zod.optin !== void 0)
            ? `optional`
            : void 0,
      ),
      O(e, `optout`, (e) =>
        e.def.options.some((e) => e._zod.optout === `optional`) ? `optional` : void 0,
      ),
      O(e, `values`, (e) => {
        if (e.def.options.every((e) => e._zod.values))
          return new Set(e.def.options.flatMap((e) => Array.from(e._zod.values)))
      }),
      O(e, `pattern`, (e) => {
        if (e.def.options.every((e) => e._zod.pattern)) {
          let t = e.def.options.map((e) => e._zod.pattern)
          return RegExp(`^(${t.map((e) => ue(e.source)).join(`|`)})$`)
        }
      }))
    let n = t.options.length === 1 ? t.options[0]._zod.run : null
    e._zod.parse = (r, i) => {
      if (n) return n(r, i)
      let a = !1,
        o = []
      for (let e of t.options) {
        let t = e._zod.run({ value: r.value, issues: [] }, i)
        if (t instanceof Promise) (o.push(t), (a = !0))
        else {
          if (t.issues.length === 0) return t
          o.push(t)
        }
      }
      return a ? Promise.all(o).then((t) => Fr(t, r, e, i)) : Fr(o, r, e, i)
    }
  })
  function Lr(e) {
    let t = /* @__PURE__ */ new Map()
    for (let n of e.options) {
      let r = n._zod.propValues?.[e.discriminator]
      if (!r || r.size === 0)
        throw Error(`Invalid discriminated union option at index "${e.options.indexOf(n)}"`)
      for (let e of r)
        if (t.has(e)) {
          if (e !== void 0) throw Error(`Duplicate discriminator value "${String(e)}"`)
          t.set(e, null)
        } else t.set(e, n)
    }
    return t
  }
  let Rr = /*@__PURE__*/ k(`$ZodDiscriminatedUnion`, (e, t) => {
      ;((t.inclusive = !1), Ir.init(e, t))
      let n = e._zod.parse
      ;(O(e, `propValues`, (e) => {
        let t = {},
          n = 0
        for (let r of e.def.options) {
          let i = r._zod.propValues
          if (!i || Object.keys(i).length === 0)
            throw Error(`Invalid discriminated union option at index "${e.def.options.indexOf(r)}"`)
          i[e.def.discriminator]?.has(void 0) && n++
          for (let [e, n] of Object.entries(i)) {
            Object.prototype.hasOwnProperty.call(t, e) || g(t, e, /* @__PURE__ */ new Set())
            for (let r of n) t[e].add(r)
          }
        }
        return (!e.def.unionFallback && n > 1 && t[e.def.discriminator]?.delete(void 0), t)
      }),
        t.options.forEach((e, n) => {
          let r = _(e._zod.def)
          if (r && !Object.prototype.hasOwnProperty.call(r, t.discriminator))
            throw Error(`Invalid discriminated union option at index "${n}"`)
        }))
      let r = h(() => Lr(t))
      e._zod.parse = (i, a) => {
        let o = i.value
        if (!ve(o))
          return (i.issues.push({ code: `invalid_type`, expected: `object`, input: o, inst: e }), i)
        let s = o?.[t.discriminator],
          c = r.value.get(s)
        return c && (s !== void 0 || a.direction !== `backward`)
          ? c._zod.run(i, a)
          : t.unionFallback || a.direction === `backward`
            ? n(i, a)
            : (i.issues.push({
                code: `invalid_union`,
                errors: [],
                note: `No matching discriminator`,
                discriminator: t.discriminator,
                options: Array.from(r.value.keys()).filter((e) => r.value.get(e) !== null),
                input: o,
                path: [t.discriminator],
                inst: e,
              }),
              i)
      }
    }),
    zr = /*@__PURE__*/ k(`$ZodIntersection`, (e, t) => {
      ;(P.init(e, t),
        (e._zod.parse = (e, n) => {
          let r = e.value,
            i = t.left._zod.run({ value: r, issues: [] }, n),
            a = t.right._zod.run({ value: r, issues: [] }, n)
          return i instanceof Promise || a instanceof Promise
            ? Promise.all([i, a]).then(([t, n]) => Vr(e, t, n))
            : Vr(e, i, a)
        }))
    })
  function Br(e, t) {
    if (e === t || (e instanceof Date && t instanceof Date && +e == +t))
      return { valid: !0, data: e }
    if (be(e) && be(t)) {
      let n = Object.keys(t),
        r = Object.keys(e).filter((e) => n.indexOf(e) !== -1),
        i = { ...e, ...t }
      Object.prototype.hasOwnProperty.call(i, `__proto__`) && delete i.__proto__
      for (let n of r) {
        if (n === `__proto__`) continue
        let r = Br(e[n], t[n])
        if (!r.valid) return { valid: !1, mergeErrorPath: [n, ...r.mergeErrorPath] }
        i[n] = r.data
      }
      return { valid: !0, data: i }
    }
    if (Array.isArray(e) && Array.isArray(t)) {
      if (e.length !== t.length) return { valid: !1, mergeErrorPath: [] }
      let n = []
      for (let r = 0; r < e.length; r++) {
        let i = e[r],
          a = t[r],
          o = Br(i, a)
        if (!o.valid) return { valid: !1, mergeErrorPath: [r, ...o.mergeErrorPath] }
        n.push(o.data)
      }
      return { valid: !0, data: n }
    }
    return { valid: !1, mergeErrorPath: [] }
  }
  function Vr(e, t, n) {
    let r = /* @__PURE__ */ new Map(),
      i,
      a = /* @__PURE__ */ new Map(),
      o = (e, t) => {
        let n
        if (e.code === `unrecognized_keys` && !e.path?.length) ((i ??= e), (n = e.keys))
        else if (e.code === `invalid_key` && e.origin === `record` && e.path?.length === 1) {
          let t = String(e.path[0])
          ;(a.has(t) || a.set(t, e), (n = [t]))
        } else return !1
        for (let e of n) (r.has(e) || r.set(e, {}), (r.get(e)[t] = !0))
        return !0
      }
    for (let n of t.issues) o(n, `l`) || e.issues.push(n)
    for (let t of n.issues) o(t, `r`) || e.issues.push(t)
    let s = [...r].filter(([, e]) => e.l && e.r).map(([e]) => e)
    if (s.length) {
      let t = i ? s.filter((e) => i.keys.includes(e)) : []
      t.length && e.issues.push({ ...i, keys: t })
      for (let n of s) !t.includes(n) && a.has(n) && e.issues.push(a.get(n))
    }
    let c = Br(t.value, n.value)
    if (!c.valid) {
      if (w(e)) return e
      throw Error(`Unmergable intersection. Error path: ${JSON.stringify(c.mergeErrorPath)}`)
    }
    return ((e.value = c.data), e)
  }
  let Hr = /*@__PURE__*/ k(`$ZodEnum`, (e, t) => {
      P.init(e, t)
      let n = ae(t.entries),
        r = new Set(n)
      ;((e._zod.values = r),
        O(e, `pattern`, (e) => {
          let t = ae(e.def.entries).filter((e) => Se.has(typeof e))
          return RegExp(t.length ? `^(${t.map((e) => x(e.toString())).join(`|`)})$` : `^[^\\s\\S]$`)
        }),
        (e._zod.parse = (t, i) => {
          let a = t.value
          return (
            r.has(a) || t.issues.push({ code: `invalid_value`, values: n, input: a, inst: e }), t
          )
        }))
    }),
    Ur = /*@__PURE__*/ k(`$ZodLiteral`, (e, t) => {
      P.init(e, t)
      let n = new Set(t.values)
      ;((e._zod.values = n),
        O(e, `pattern`, (e) => {
          let t = e.def.values
          return RegExp(
            t.length
              ? `^(${t.map((e) => (typeof e == `string` ? x(e) : e ? x(e.toString()) : String(e))).join(`|`)})$`
              : `^[^\\s\\S]$`,
          )
        }),
        (e._zod.parse = (r, i) => {
          let a = r.value
          return (
            n.has(a) ||
              r.issues.push({ code: `invalid_value`, values: t.values, input: a, inst: e }),
            r
          )
        }))
    }),
    Wr = /*@__PURE__*/ k(`$ZodTransform`, (e, t) => {
      ;(P.init(e, t),
        (e._zod.optin = `optional`),
        j.memoizer?.guard(e),
        (e._zod.parse = (n, r) => {
          if (r.direction === `backward`) throw new at(e.constructor.name)
          let i = t.transform(n.value, n)
          if (r.async)
            return (i instanceof Promise ? i : Promise.resolve(i)).then((e) => ((n.value = e), n))
          if (i instanceof Promise) throw new A()
          return ((n.value = i), n)
        }))
    })
  function Gr(e, t) {
    return ((e.value = t.issues.length ? void 0 : t.value), e)
  }
  let Kr = /*@__PURE__*/ k(`$ZodOptional`, (e, t) => {
      ;(P.init(e, t),
        O(e, `optin`, (e) =>
          e.def.innerType._zod.optin === `defaulted` ? `defaulted` : `optional`,
        ),
        (e._zod.optout = `optional`),
        O(e, `values`, (e) => {
          let t = e.def.innerType._zod.values
          return t ? /* @__PURE__ */ new Set([...t, void 0]) : void 0
        }),
        O(e, `pattern`, (e) => {
          let t = e.def.innerType._zod.pattern
          return t ? RegExp(`^(${ue(t.source)})?$`) : void 0
        }),
        (e._zod.parse = (e, n) => {
          if (e.value === void 0) {
            if (t.innerType._zod.optin !== `defaulted`) return e
            let r = t.innerType._zod.run({ value: e.value, issues: [] }, n)
            return r instanceof Promise ? r.then((t) => Gr(e, t)) : Gr(e, r)
          }
          return t.innerType._zod.run(e, n)
        }))
    }),
    qr = /*@__PURE__*/ k(`$ZodExactOptional`, (e, t) => {
      ;(Kr.init(e, t),
        O(e, `values`, (e) => e.def.innerType._zod.values),
        O(e, `pattern`, (e) => e.def.innerType._zod.pattern),
        (e._zod.parse = (e, n) => t.innerType._zod.run(e, n)))
    }),
    Jr = /*@__PURE__*/ k(`$ZodNullable`, (e, t) => {
      ;(P.init(e, t),
        O(e, `optin`, (e) => e.def.innerType._zod.optin),
        O(e, `optout`, (e) => e.def.innerType._zod.optout),
        O(e, `pattern`, (e) => {
          let t = e.def.innerType._zod.pattern
          return t ? RegExp(`^(${ue(t.source)}|null)$`) : void 0
        }),
        O(e, `values`, (e) =>
          e.def.innerType._zod.values
            ? /* @__PURE__ */ new Set([...e.def.innerType._zod.values, null])
            : void 0,
        ),
        (e._zod.parse = (e, n) => (e.value === null ? e : t.innerType._zod.run(e, n))))
    }),
    Yr = /*@__PURE__*/ k(`$ZodDefault`, (e, t) => {
      ;(P.init(e, t),
        (e._zod.optin = `defaulted`),
        O(e, `values`, (e) => e.def.innerType._zod.values),
        (e._zod.parse = (e, n) => {
          if (n.direction === `backward`) return t.innerType._zod.run(e, n)
          if (e.value === void 0) return ((e.value = t.defaultValue), e)
          let r = t.innerType._zod.run(e, n)
          return r instanceof Promise ? r.then((e) => Xr(e, t)) : Xr(r, t)
        }))
    })
  function Xr(e, t) {
    return (e.value === void 0 && (e.value = t.defaultValue), e)
  }
  let Zr = /*@__PURE__*/ k(`$ZodPrefault`, (e, t) => {
      ;(P.init(e, t),
        (e._zod.optin = `defaulted`),
        O(e, `values`, (e) => e.def.innerType._zod.values),
        (e._zod.parse = (e, n) => (
          n.direction === `backward` || (e.value === void 0 && (e.value = t.defaultValue)),
          t.innerType._zod.run(e, n)
        )))
    }),
    Qr = /*@__PURE__*/ k(`$ZodNonOptional`, (e, t) => {
      ;(P.init(e, t),
        O(e, `values`, (e) => {
          let t = e.def.innerType._zod.values
          return t ? new Set([...t].filter((e) => e !== void 0)) : void 0
        }),
        (e._zod.parse = (n, r) => {
          let i = t.innerType._zod.run(n, r)
          return i instanceof Promise ? i.then((t) => $r(t, e)) : $r(i, e)
        }))
    })
  function $r(e, t) {
    return (
      !e.issues.length &&
        e.value === void 0 &&
        e.issues.push({ code: `invalid_type`, expected: `nonoptional`, input: e.value, inst: t }),
      e
    )
  }
  function ei(e, t, n, r) {
    return t.issues.length
      ? ((e.value = n.catchValue({
          ...t,
          value: e.value,
          error: { issues: t.issues.map((e) => T(e, r, M())) },
          input: e.value,
        })),
        e)
      : ((e.value = t.value), t.memo && (e.memo = !0), e)
  }
  let ti = /*@__PURE__*/ k(`$ZodCatch`, (e, t) => {
      ;(P.init(e, t),
        O(e, `optin`, (e) =>
          e.def.innerType._zod.optin === `defaulted` ? `defaulted` : `optional`,
        ),
        O(e, `optout`, (e) => e.def.innerType._zod.optout),
        O(e, `values`, (e) => e.def.innerType._zod.values),
        (e._zod.parse = (e, n) => {
          if (n.direction === `backward`) return t.innerType._zod.run(e, n)
          let r = t.innerType._zod.run({ value: e.value, issues: [] }, n)
          return r instanceof Promise ? r.then((r) => ei(e, r, t, n)) : ei(e, r, t, n)
        }))
    }),
    ni = /*@__PURE__*/ k(`$ZodPipe`, (e, t) => {
      ;(P.init(e, t),
        O(e, `values`, (e) => e.def.in._zod.values),
        O(e, `optin`, (e) => e.def.in._zod.optin),
        O(e, `optout`, (e) => e.def.out._zod.optout),
        O(e, `propValues`, (e) => e.def.in._zod.propValues),
        (e._zod.parse = (e, n) => {
          if (n.direction === `backward`) {
            let r = t.out._zod.run(e, n)
            return r instanceof Promise ? r.then((e) => ri(e, t.in, n)) : ri(r, t.in, n)
          }
          let r = t.in._zod.run(e, n)
          return r instanceof Promise ? r.then((e) => ri(e, t.out, n)) : ri(r, t.out, n)
        }))
    })
  function ri(e, t, n) {
    return e.issues.some((e) => e.code !== `unrecognized_keys`)
      ? ((e.aborted = !0), e)
      : t._zod.run({ value: e.value, issues: e.issues }, n)
  }
  let ii = /*@__PURE__*/ k(`$ZodPreprocess`, (e, t) => {
      ni.init(e, t)
    }),
    ai = /*@__PURE__*/ k(`$ZodReadonly`, (e, t) => {
      ;(P.init(e, t),
        O(e, `propValues`, (e) => e.def.innerType._zod.propValues),
        O(e, `values`, (e) => e.def.innerType._zod.values),
        O(e, `optin`, (e) => e.def.innerType?._zod?.optin),
        O(e, `optout`, (e) => e.def.innerType?._zod?.optout),
        (e._zod.parse = (e, n) => {
          if (n.direction === `backward`) return t.innerType._zod.run(e, n)
          let r = t.innerType._zod.run(e, n)
          return r instanceof Promise ? r.then(oi) : oi(r)
        }))
    })
  function oi(e) {
    return (e.memo || (e.value = Object.freeze(e.value)), e)
  }
  let si = /*@__PURE__*/ k(`$ZodCustom`, (e, t) => {
    ;(N.init(e, t),
      P.init(e, t),
      (e._zod.parse = (e, t) => e),
      (e._zod.check = (n) => {
        let r = n.value,
          i = t.fn(r)
        if (i instanceof Promise) return i.then((t) => ci(t, n, r, e))
        ci(i, n, r, e)
      }))
  })
  function ci(e, t, n, r) {
    if (!e) {
      let e = {
        code: `custom`,
        input: n,
        inst: r,
        path: [...(r._zod.def.path ?? [])],
        continue: !r._zod.def.abort,
      }
      ;(r._zod.def.params && (e.params = r._zod.def.params), t.issues.push(Ge(e)))
    }
  }
  var li = class extends Error {
    constructor() {
      ;(super(`Cannot parse a reference cycle that closes through a transform`),
        (this.name = `ZodCyclicError`))
    }
  }
  let ui = `~memo`,
    di = []
  function fi(e) {
    return typeof e == `object` && !!e
  }
  function pi(e) {
    return e.map((e) => (e.path ? { ...e, path: e.path.slice() } : { ...e }))
  }
  let mi = /*@__PURE__*/ new WeakMap()
  function hi(e, t, n) {
    let r = mi.get(e)
    if (r !== void 0) return r ? 2 : 0
    if (t.has(e)) return 2
    t.add(e)
    let i = 0,
      a = (e) => {
        if (i !== 2 && e?._zod) {
          let r = hi(e, t, n)
          r > i && (i = r)
        }
      },
      o = (e, r) => {
        let i = 0
        for (let a of Reflect.ownKeys(e)) {
          let o = Object.getOwnPropertyDescriptor(e, a)
          if (r && !o.enumerable) continue
          let s = o.get ? 1 : o.value?._zod ? hi(o.value, t, n) : 0
          s > i && (i = s)
        }
        return i
      },
      s = (e) => {
        e > i && (i = e)
      },
      c = e._zod.def
    switch (c.type) {
      case `object`: {
        let e = _(c)
        ;(s(e ? o(e, !0) : 1), a(c.catchall))
        break
      }
      case `array`:
        a(c.element)
        break
      case `tuple`:
        for (let e of c.items) a(e)
        a(c.rest)
        break
      case `record`:
      case `map`:
        ;(a(c.keyType), a(c.valueType))
        break
      case `set`:
        a(c.valueType)
        break
      case `union`:
        for (let e of c.options) a(e)
        break
      case `intersection`:
        ;(a(c.left), a(c.right))
        break
      case `optional`:
      case `nullable`:
      case `default`:
      case `prefault`:
      case `catch`:
      case `readonly`:
      case `nonoptional`:
      case `promise`:
      case `success`:
        a(c.innerType)
        break
      case `pipe`:
        ;(a(c.in), a(c.out))
        break
      case `function`:
        ;(a(c.input), a(c.output))
        break
      case `lazy`: {
        let r = c._cachedInner ?? (n ? e._zod.innerType : void 0)
        s(r ? hi(r, t, !1) : 1)
        break
      }
      case `template_literal`:
      case `string`:
      case `number`:
      case `int`:
      case `boolean`:
      case `bigint`:
      case `symbol`:
      case `undefined`:
      case `null`:
      case `void`:
      case `never`:
      case `any`:
      case `unknown`:
      case `date`:
      case `nan`:
      case `enum`:
      case `literal`:
      case `file`:
      case `transform`:
      case `custom`:
        break
      default:
        for (let e in c) {
          let t = Object.getOwnPropertyDescriptor(c, e)
          if (!t || t.get) continue
          let n = t.value
          if (n && typeof n == `object`) {
            if (n._zod) a(n)
            else if (Array.isArray(n)) for (let e of n) a(e)
          }
        }
    }
    return (t.delete(e), gi(e, i))
  }
  function gi(e, t) {
    return (t !== 1 && mi.set(e, t === 2), t)
  }
  function _i(e, t) {
    let n = e.buckets.get(t)
    return (n || ((n = /* @__PURE__ */ new WeakMap()), e.buckets.set(t, n)), n)
  }
  let vi,
    yi = [],
    bi = {
      alloc(e, t, n) {
        let r = vi
        if (!r) return n
        vi = void 0
        let i = { value: n, issues: null }
        return (r.set(t.value, i), yi.push(i), n)
      },
      guard(e) {
        var t
        ;((t = e._zod).deferred ?? (t.deferred = []),
          e._zod.deferred.push(() => {
            let t = e._zod.parse,
              n = (e, n) => {
                if (n.direction !== `backward` && Si(n, e.value)) throw new li()
                return t(e, n)
              }
            ;((e._zod.parse = n), e._zod.run === t && (e._zod.run = n))
          }))
      },
      attach(e) {
        var t
        let n,
          r = !1,
          i,
          a
        ;((t = e._zod).deferred ?? (t.deferred = []),
          e._zod.deferred.push(() => {
            let t = e._zod.parse,
              o = (s, c) => {
                if (n === void 0) {
                  let i = hi(e, /* @__PURE__ */ new Set(), !1)
                  if (i === 0)
                    return ((e._zod.parse = t), e._zod.run === o && (e._zod.run = t), t(s, c))
                  i === 2 || r ? (n = !0) : (r = !0)
                }
                let l = s.value
                if (!fi(l)) return t(s, c)
                let u = c[ui]
                u ||
                  ((u = { buckets: /* @__PURE__ */ new WeakMap(), backEdges: void 0 }), (c[ui] = u))
                let d
                i === c ? (d = a) : ((d = _i(u, e)), (i = c), (a = d))
                let f = d.get(l)
                if (f)
                  return (
                    (s.value = f.value),
                    f.issues
                      ? f.issues.length && s.issues.push(...pi(f.issues))
                      : ((s.memo = !0),
                        u.backEdges ?? (u.backEdges = /* @__PURE__ */ new WeakSet()),
                        u.backEdges.add(f.value)),
                    s
                  )
                vi = d
                let p = yi.length,
                  m = t(s, c)
                vi = void 0
                let ee = yi.length > p ? yi.pop() : void 0
                return m instanceof Promise
                  ? m.then((e) => (ee && (ee.issues = e.issues.length ? pi(e.issues) : di), e))
                  : (ee && (ee.issues = m.issues.length ? pi(m.issues) : di), m)
              }
            ;((e._zod.parse = o), e._zod.run === t && (e._zod.run = o))
          }))
      },
    }
  function xi() {
    return bi
  }
  function Si(e, t) {
    let n = e[ui]?.backEdges
    return n !== void 0 && fi(t) && n.has(t)
  }
  let Ci = () => {
    let e = {
      string: { unit: `characters`, verb: `to have` },
      file: { unit: `bytes`, verb: `to have` },
      array: { unit: `items`, verb: `to have` },
      set: { unit: `items`, verb: `to have` },
      map: { unit: `entries`, verb: `to have` },
    }
    function t(t) {
      return e[t] ?? null
    }
    let n = {
        regex: `input`,
        email: `email address`,
        url: `URL`,
        emoji: `emoji`,
        uuid: `UUID`,
        uuidv4: `UUIDv4`,
        uuidv6: `UUIDv6`,
        nanoid: `nanoid`,
        guid: `GUID`,
        cuid: `cuid`,
        cuid2: `cuid2`,
        ulid: `ULID`,
        xid: `XID`,
        ksuid: `KSUID`,
        datetime: `ISO datetime`,
        date: `ISO date`,
        time: `ISO time`,
        duration: `ISO duration`,
        ipv4: `IPv4 address`,
        ipv6: `IPv6 address`,
        mac: `MAC address`,
        cidrv4: `IPv4 range`,
        cidrv6: `IPv6 range`,
        base64: `base64-encoded string`,
        base64url: `base64url-encoded string`,
        json_string: `JSON string`,
        e164: `E.164 number`,
        currency_code: `currency code`,
        credit_card: `credit card number`,
        iban: `IBAN`,
        jwt: `JWT`,
        template_literal: `input`,
      },
      r = { nan: `NaN` }
    function i(e, t) {
      return e === `number` && typeof t == `number` && !Number.isFinite(t) ? String(t) : (r[e] ?? e)
    }
    return (e) => {
      switch (e.code) {
        case `invalid_type`:
          return `Invalid input: expected ${i(e.expected)}, received ${i(We(e.input), e.input)}`
        case `invalid_value`:
          return e.values.length === 1
            ? `Invalid input: expected ${Ce(e.values[0])}`
            : `Invalid option: expected one of ${oe(e.values, `|`)}`
        case `too_big`: {
          let n = e.exact ? `exactly ` : e.inclusive ? `<=` : `<`,
            r = t(e.origin)
          return r
            ? `Too big: expected ${e.origin ?? `value`} to have ${n}${e.maximum.toString()} ${r.unit ?? `elements`}`
            : `Too big: expected ${e.origin ?? `value`} to be ${n}${e.maximum.toString()}`
        }
        case `too_small`: {
          let n = e.exact ? `exactly ` : e.inclusive ? `>=` : `>`,
            r = t(e.origin)
          return r
            ? `Too small: expected ${e.origin} to have ${n}${e.minimum.toString()} ${r.unit}`
            : `Too small: expected ${e.origin} to be ${n}${e.minimum.toString()}`
        }
        case `invalid_format`: {
          let t = e
          return t.format === `starts_with`
            ? `Invalid string: must start with "${t.prefix}"`
            : t.format === `ends_with`
              ? `Invalid string: must end with "${t.suffix}"`
              : t.format === `includes`
                ? `Invalid string: must include "${t.includes}"`
                : t.format === `regex`
                  ? `Invalid string: must match pattern ${t.pattern}`
                  : `Invalid ${n[t.format] ?? e.format}`
        }
        case `not_multiple_of`:
          return `Invalid number: must be a multiple of ${e.divisor}`
        case `unrecognized_keys`:
          return `Unrecognized key${e.keys.length > 1 ? `s` : ``}: ${oe(e.keys, `, `)}`
        case `invalid_key`:
          return `Invalid key in ${e.origin}`
        case `invalid_union`:
          return e.options && Array.isArray(e.options) && e.options.length > 0
            ? `Invalid discriminator value. Expected ${e.options.map((e) => `'${e}'`).join(` | `)}`
            : e.inclusive === !1
              ? `Invalid input: more than one option matched`
              : `Invalid input`
        case `invalid_element`:
          return `Invalid value in ${e.origin}`
        default:
          return `Invalid input`
      }
    }
  }
  function wi() {
    return { localeError: Ci() }
  }
  var Ti,
    Ei = class {
      constructor() {
        ;((this._map = /* @__PURE__ */ new WeakMap()), (this._idmap = /* @__PURE__ */ new Map()))
      }
      add(e, ...t) {
        let n = t[0]
        return (
          this._map.set(e, n),
          n && typeof n == `object` && `id` in n && this._idmap.set(n.id, e),
          this
        )
      }
      clear() {
        return (
          (this._map = /* @__PURE__ */ new WeakMap()),
          (this._idmap = /* @__PURE__ */ new Map()),
          this
        )
      }
      remove(e) {
        let t = this._map.get(e)
        return (
          t && typeof t == `object` && `id` in t && this._idmap.delete(t.id),
          this._map.delete(e),
          this
        )
      }
      get(e) {
        let t = e._zod.parent
        if (t) {
          let n = { ...(this.get(t) ?? {}) }
          delete n.id
          let r = { ...n, ...this._map.get(e) }
          return Object.keys(r).length ? r : void 0
        }
        return this._map.get(e)
      }
      has(e) {
        return this._map.has(e)
      }
    }
  function Di() {
    return new Ei()
  }
  ;(Ti = globalThis).__zod_globalRegistry ?? (Ti.__zod_globalRegistry = Di())
  let Oi = globalThis.__zod_globalRegistry
  function ki(e) {
    return ((e.checks &&= [...e.checks]), e)
  } // @__NO_SIDE_EFFECTS__
  function Ai(e, t) {
    return new e(ki({ type: `string`, ...C(t) }))
  } // @__NO_SIDE_EFFECTS__
  function ji(e, t) {
    return new e({ type: `string`, format: `email`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Mi(e, t) {
    return new e({ type: `string`, format: `guid`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Ni(e, t) {
    return new e({ type: `string`, format: `uuid`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Pi(e, t) {
    return new e({
      type: `string`,
      format: `uuid`,
      check: `string_format`,
      abort: !1,
      version: `v4`,
      ...C(t),
    })
  } // @__NO_SIDE_EFFECTS__
  function Fi(e, t) {
    return new e({
      type: `string`,
      format: `uuid`,
      check: `string_format`,
      abort: !1,
      version: `v6`,
      ...C(t),
    })
  } // @__NO_SIDE_EFFECTS__
  function Ii(e, t) {
    return new e({
      type: `string`,
      format: `uuid`,
      check: `string_format`,
      abort: !1,
      version: `v7`,
      ...C(t),
    })
  } // @__NO_SIDE_EFFECTS__
  function Li(e, t) {
    return new e({ type: `string`, format: `url`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Ri(e, t) {
    return new e({ type: `string`, format: `emoji`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function zi(e, t) {
    return new e({ type: `string`, format: `nanoid`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Bi(e, t) {
    return new e({ type: `string`, format: `cuid`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Vi(e, t) {
    return new e({ type: `string`, format: `cuid2`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Hi(e, t) {
    return new e({ type: `string`, format: `ulid`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Ui(e, t) {
    return new e({ type: `string`, format: `xid`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Wi(e, t) {
    return new e({ type: `string`, format: `ksuid`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Gi(e, t) {
    return new e({ type: `string`, format: `ipv4`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Ki(e, t) {
    return new e({ type: `string`, format: `ipv6`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function qi(e, t) {
    return new e({ type: `string`, format: `cidrv4`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Ji(e, t) {
    return new e({ type: `string`, format: `cidrv6`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Yi(e, t) {
    return new e({ type: `string`, format: `base64`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Xi(e, t) {
    return new e({
      type: `string`,
      format: `base64url`,
      check: `string_format`,
      abort: !1,
      ...C(t),
    })
  } // @__NO_SIDE_EFFECTS__
  function Zi(e, t) {
    return new e({ type: `string`, format: `e164`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function Qi(e, t) {
    return new e({ type: `string`, format: `jwt`, check: `string_format`, abort: !1, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function $i(e, t) {
    return new e({
      type: `string`,
      format: `datetime`,
      check: `string_format`,
      offset: !1,
      local: !1,
      precision: null,
      ...C(t),
    })
  } // @__NO_SIDE_EFFECTS__
  function ea(e, t) {
    return new e({ type: `string`, format: `date`, check: `string_format`, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function ta(e, t) {
    return new e({
      type: `string`,
      format: `time`,
      check: `string_format`,
      precision: null,
      ...C(t),
    })
  } // @__NO_SIDE_EFFECTS__
  function na(e, t) {
    return new e({ type: `string`, format: `duration`, check: `string_format`, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function ra(e, t) {
    return new e(ki({ type: `number`, checks: [], ...C(t) }))
  } // @__NO_SIDE_EFFECTS__
  function ia(e, t) {
    return new e(ki({ type: `number`, coerce: !0, checks: [], ...C(t) }))
  } // @__NO_SIDE_EFFECTS__
  function aa(e, t) {
    return new e({ type: `number`, check: `number_format`, abort: !1, format: `safeint`, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function oa(e, t) {
    return new e({ type: `boolean`, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function sa(e) {
    return new e({ type: `unknown` })
  } // @__NO_SIDE_EFFECTS__
  function ca(e, t) {
    return new e({ type: `never`, ...C(t) })
  } // @__NO_SIDE_EFFECTS__
  function la(e, t) {
    return new hn({ check: `less_than`, ...C(t), value: e, inclusive: !1 })
  } // @__NO_SIDE_EFFECTS__
  function ua(e, t) {
    return new hn({ check: `less_than`, ...C(t), value: e, inclusive: !0 })
  } // @__NO_SIDE_EFFECTS__
  function da(e, t) {
    return new gn({ check: `greater_than`, ...C(t), value: e, inclusive: !1 })
  } // @__NO_SIDE_EFFECTS__
  function fa(e, t) {
    return new gn({ check: `greater_than`, ...C(t), value: e, inclusive: !0 })
  } // @__NO_SIDE_EFFECTS__
  function pa(e, t) {
    return new _n({ check: `multiple_of`, ...C(t), value: e })
  } // @__NO_SIDE_EFFECTS__
  function ma(e, t) {
    return new yn({ check: `max_length`, ...C(t), maximum: e })
  } // @__NO_SIDE_EFFECTS__
  function ha(e, t) {
    return new bn({ check: `min_length`, ...C(t), minimum: e })
  } // @__NO_SIDE_EFFECTS__
  function ga(e, t) {
    return new xn({ check: `length_equals`, ...C(t), length: e })
  } // @__NO_SIDE_EFFECTS__
  function _a(e, t) {
    return new Cn({ check: `string_format`, format: `regex`, ...C(t), pattern: e })
  } // @__NO_SIDE_EFFECTS__
  function va(e) {
    return new wn({ check: `string_format`, format: `lowercase`, ...C(e) })
  } // @__NO_SIDE_EFFECTS__
  function ya(e) {
    return new Tn({ check: `string_format`, format: `uppercase`, ...C(e) })
  } // @__NO_SIDE_EFFECTS__
  function ba(e, t) {
    return new En({ check: `string_format`, format: `includes`, ...C(t), includes: e })
  } // @__NO_SIDE_EFFECTS__
  function xa(e, t) {
    return new Dn({ check: `string_format`, format: `starts_with`, ...C(t), prefix: e })
  } // @__NO_SIDE_EFFECTS__
  function Sa(e, t) {
    return new On({ check: `string_format`, format: `ends_with`, ...C(t), suffix: e })
  } // @__NO_SIDE_EFFECTS__
  function I(e) {
    return new kn({ check: `overwrite`, tx: e })
  } // @__NO_SIDE_EFFECTS__
  function Ca(e) {
    return /* @__PURE__ */ I((t) => t.normalize(e))
  } // @__NO_SIDE_EFFECTS__
  function wa() {
    return /* @__PURE__ */ I((e) => e.trim())
  } // @__NO_SIDE_EFFECTS__
  function Ta() {
    return /* @__PURE__ */ I((e) => e.toLowerCase())
  } // @__NO_SIDE_EFFECTS__
  function Ea() {
    return /* @__PURE__ */ I((e) => e.toUpperCase())
  } // @__NO_SIDE_EFFECTS__
  function Da() {
    return /* @__PURE__ */ I((e) => ge(e))
  } // @__NO_SIDE_EFFECTS__
  function Oa(e, t, n) {
    return new e({ type: `array`, element: t, ...C(n) })
  } // @__NO_SIDE_EFFECTS__
  function ka(e, t, n) {
    return new e({ type: `custom`, check: `custom`, fn: t, ...C(n) })
  } // @__NO_SIDE_EFFECTS__
  function Aa(e, t) {
    let n = /* @__PURE__ */ ja(
      (t) => (
        (t.addIssue = (e) => {
          if (typeof e == `string`) t.issues.push(Ge(e, t.value, n._zod.def))
          else {
            let r = e
            ;(r.fatal && (r.continue = !1),
              (r.code ??= `custom`),
              `input` in r || (r.input = t.value),
              (r.inst ??= n),
              (r.continue ??= !n._zod.def.abort),
              t.issues.push(Ge(r)))
          }
        }),
        e(t.value, t)
      ),
      t,
    )
    return n
  } // @__NO_SIDE_EFFECTS__
  function ja(e, t) {
    let n = new N({ check: `custom`, ...C(t) })
    return ((n._zod.check = e), n)
  }
  function Ma(e, ...t) {
    for (let n of t)
      for (let t of Reflect.ownKeys(n))
        Object.prototype.propertyIsEnumerable.call(n, t) && g(e, t, n[t])
    return e
  }
  function Na(e) {
    let t = e?.target ?? `draft-2020-12`
    return (
      t === `draft-4` && (t = `draft-04`),
      t === `draft-7` && (t = `draft-07`),
      {
        processors: e.processors ?? {},
        metadataRegistry: e?.metadata ?? Oi,
        target: t,
        unrepresentable: e?.unrepresentable ?? `throw`,
        override: e?.override ?? (() => {}),
        io: e?.io ?? `output`,
        counter: 0,
        seen: /* @__PURE__ */ new Map(),
        sharedDefsExtractedFor: void 0,
        sharedEmitDoneFor: void 0,
        cycles: e?.cycles ?? `ref`,
        reused: e?.reused ?? `inline`,
        intersections: [],
        deferred: [],
        external: e?.external ?? void 0,
      }
    )
  }
  function L(e, t, n, r, i) {
    let a =
      typeof t.unrepresentable == `function`
        ? t.unrepresentable({ zodSchema: e, path: r.path, message: i })
        : t.unrepresentable
    if (a === `any`) return !1
    if (a === void 0 || a === `throw`) throw Error(i)
    return (Object.assign(n, a), !0)
  }
  function R(e, t, n = { path: [], schemaPath: [] }) {
    var r
    let i = e._zod.def,
      a = t.seen.get(e)
    if (a) return (a.count++, n.schemaPath.includes(e) && (a.cycle = n.path), a.schema)
    let o = { schema: {}, count: 1, cycle: void 0, path: n.path }
    ;(t.seen.set(e, o), (t.sharedDefsExtractedFor = void 0), (t.sharedEmitDoneFor = void 0))
    let s = e._zod.toJSONSchema?.()
    if (s) o.schema = s
    else {
      let r = { ...n, schemaPath: [...n.schemaPath, e], path: n.path }
      if (e._zod.processJSONSchema) e._zod.processJSONSchema(t, o.schema, r)
      else {
        let n = o.schema,
          a = t.processors[i.type]
        if (!a) throw Error(`[toJSONSchema]: Non-representable type encountered: ${i.type}`)
        a(e, t, n, r)
      }
      let a = e._zod.parent
      a && ((o.ref ||= a), R(a, t, r), (t.seen.get(a).isParent = !0))
    }
    let c = t.metadataRegistry.get(e)
    return (
      c && Ma(o.schema, c),
      t.io === `input` && z(e) && (delete o.schema.examples, delete o.schema.default),
      t.io === `input` &&
        `_prefault` in o.schema &&
        ((r = o.schema).default ?? (r.default = o.schema._prefault)),
      delete o.schema._prefault,
      t.seen.get(e).schema
    )
  }
  function Pa(e) {
    return e.replace(/~/g, `~0`).replace(/\//g, `~1`)
  }
  function Fa(e, t) {
    let n = e.seen.get(t)
    if (!n) throw Error(`Unprocessed schema. This is a bug in Zod.`)
    if (e.external && e.sharedDefsExtractedFor === e.external) return
    let r = /* @__PURE__ */ new Map()
    for (let t of e.seen.entries()) {
      let n = e.metadataRegistry.get(t[0])?.id
      if (n) {
        let e = r.get(n)
        if (e && e !== t[0])
          throw Error(
            `Duplicate schema id "${n}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`,
          )
        r.set(n, t[0])
      }
    }
    let i = (t) => {
        let r = e.target === `draft-2020-12` ? `$defs` : `definitions`
        if (e.external) {
          let n = e.external.registry.get(t[0])?.id,
            i = e.external.uri ?? ((e) => e)
          if (n) return { ref: i(n) }
          let a = t[1].defId ?? t[1].schema.id ?? `schema${e.counter++}`
          return ((t[1].defId = a), { defId: a, ref: `${i(`__shared`)}#/${r}/${Pa(a)}` })
        }
        let i = `#/${r}/`
        if (t[1] === n && !t[1].schema.id) return { ref: `#` }
        let a = t[1].schema.id ?? `__schema${e.counter++}`
        return { defId: a, ref: i + Pa(a) }
      },
      a = (e) => {
        if (e[1].schema.$ref) return
        let t = e[1],
          { ref: n, defId: r } = i(e)
        ;((t.def = { ...t.schema }), r && (t.defId = r))
        let a = t.schema
        for (let e in a) delete a[e]
        a.$ref = n
      }
    if (e.cycles === `throw`)
      for (let t of e.seen.entries()) {
        let e = t[1]
        if (e.cycle)
          throw Error(`Cycle detected: #/${e.cycle?.join(`/`)}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`)
      }
    for (let n of e.seen.entries()) {
      let r = n[1]
      if (t === n[0]) a(n)
      else {
        if (e.external) {
          let r = e.external.registry.get(n[0])?.id
          if (t !== n[0] && r) {
            a(n)
            continue
          }
        }
        ;(e.metadataRegistry.get(n[0])?.id || r.cycle || (r.count > 1 && e.reused === `ref`)) &&
          a(n)
      }
    }
    e.external && (e.sharedDefsExtractedFor = e.external)
  }
  function Ia(e) {
    let t = e.anyOf
    if (!Array.isArray(t) || t.length === 0 || e.type !== void 0) return
    let n = []
    for (let e of t) {
      if (!e || typeof e != `object`) return
      Ia(e)
      let t = Object.keys(e)
      if (t.length !== 1 || t[0] !== `type`) return
      let r = e.type
      for (let e of Array.isArray(r) ? r : [r]) {
        if (typeof e != `string`) return
        n.includes(e) || n.push(e)
      }
    }
    ;(delete e.anyOf, (e.type = n.length === 1 ? n[0] : n))
  }
  let La = /* @__PURE__ */ new Set([`type`, `properties`, `required`, `additionalProperties`]),
    Ra = [`oneOf`, `anyOf`]
  function za(e) {
    let t = e.additionalProperties
    return t === void 0 || t === !1 || typeof t != `object` || !t
      ? null
      : Object.keys(t).length
        ? t
        : null
  }
  function Ba(e) {
    let t = []
    for (let n of e) {
      if (typeof n != `object` || n.type !== `object`) return null
      for (let e in n) if (!La.has(e)) return null
      t.push(n)
    }
    let n = {},
      r = /* @__PURE__ */ new Set()
    for (let e of t) {
      for (let r in e.properties) {
        if (Object.prototype.hasOwnProperty.call(n, r)) continue
        let e = []
        for (let n of t) {
          let t = n.properties?.[r] ?? za(n)
          t != null && (e.some((e) => JSON.stringify(e) === JSON.stringify(t)) || e.push(t))
        }
        g(n, r, e.length === 1 ? e[0] : (Ba(e) ?? { allOf: e }))
      }
      for (let t of e.required ?? []) r.add(t)
    }
    let i = { type: `object`, properties: n }
    if ((r.size && (i.required = [...r]), t.every((e) => e.additionalProperties === !1)))
      i.additionalProperties = !1
    else {
      let e = []
      for (let n of t) {
        let t = za(n)
        t && !e.some((e) => JSON.stringify(e) === JSON.stringify(t)) && e.push(t)
      }
      e.length === 1
        ? (i.additionalProperties = e[0])
        : e.length > 1 && (i.additionalProperties = { allOf: e })
    }
    return i
  }
  function Va(e) {
    let t = e.allOf
    if (!Array.isArray(t) || t.length < 2) return
    for (let t of La) if (t in e) return
    let n = t.filter((e) => Ra.some((t) => Array.isArray(e[t]))),
      r = null
    if (!n.length) r = Ba(t)
    else {
      let e = n[0],
        i = Ra.find((t) => Array.isArray(e[t]))
      if (Object.keys(e).length !== 1) return
      let a = t.filter((t) => t !== e),
        o = e[i].map((e) => Ba([...a, e]))
      if (o.some((e) => !e)) return
      r = { [i]: o }
    }
    r && (delete e.allOf, Ma(e, r))
  }
  function Ha(e, t) {
    let n = e.seen.get(t)
    if (!n) throw Error(`Unprocessed schema. This is a bug in Zod.`)
    let r = (t) => {
      let n = e.seen.get(t)
      if (n.ref === null) return
      let i = n.def ?? n.schema,
        a = { ...i },
        o = n.ref
      if (((n.ref = null), o)) {
        r(o)
        let n = e.seen.get(o),
          s = n.schema
        if (
          (s.$ref &&
          (e.target === `draft-07` || e.target === `draft-04` || e.target === `openapi-3.0`)
            ? ((i.allOf = i.allOf ?? []), i.allOf.push(s))
            : Ma(i, s),
          Ma(i, a),
          t._zod.parent === o)
        )
          for (let e in i) e !== `$ref` && e !== `allOf` && (e in a || delete i[e])
        if (s.$ref && n.def)
          for (let e in i)
            e !== `$ref` &&
              e !== `allOf` &&
              e in n.def &&
              JSON.stringify(i[e]) === JSON.stringify(n.def[e]) &&
              delete i[e]
      }
      let s = t._zod.parent
      if (s && s !== o) {
        r(s)
        let t = e.seen.get(s)
        if (t?.schema.$ref && ((i.$ref = t.schema.$ref), t.def))
          for (let e in i)
            e !== `$ref` &&
              e !== `allOf` &&
              e in t.def &&
              JSON.stringify(i[e]) === JSON.stringify(t.def[e]) &&
              delete i[e]
      }
      e.override({ zodSchema: t, jsonSchema: i, path: n.path ?? [] })
    }
    if (!e.external || e.sharedEmitDoneFor !== e.external) {
      for (let t of [...e.seen.entries()].reverse()) r(t[0])
      if (e.target !== `openapi-3.0`) for (let t of e.seen.entries()) Ia(t[1].def ?? t[1].schema)
      for (let t of e.deferred) t()
      if (e.intersections.length) {
        let t = /* @__PURE__ */ new Map()
        for (let n of e.seen.values())
          for (let e of [n.schema, n.def]) {
            let n = e?.allOf
            if (!Array.isArray(n)) continue
            let r = t.get(n)
            r ? r.push(e) : t.set(n, [e])
          }
        for (let n of e.intersections) for (let e of t.get(n) ?? []) Va(e)
      }
    }
    let i = {}
    if (
      (e.target === `draft-2020-12`
        ? (i.$schema = `https://json-schema.org/draft/2020-12/schema`)
        : e.target === `draft-07`
          ? (i.$schema = `http://json-schema.org/draft-07/schema#`)
          : e.target === `draft-04`
            ? (i.$schema = `http://json-schema.org/draft-04/schema#`)
            : e.target,
      e.external?.uri)
    ) {
      let n = e.external.registry.get(t)?.id
      if (!n) throw Error('Schema is missing an `id` property')
      i.$id = e.external.uri(n)
    }
    Ma(i, n.defId ? n.schema : (n.def ?? n.schema))
    let a = e.metadataRegistry.get(t)?.id
    a !== void 0 && i.id === a && delete i.id
    let o = e.external?.defs ?? {}
    if (!e.external || e.sharedEmitDoneFor !== e.external)
      for (let t of e.seen.entries()) {
        let e = t[1]
        e.def && e.defId && (e.def.id === e.defId && delete e.def.id, g(o, e.defId, e.def))
      }
    ;(e.external && (e.sharedEmitDoneFor = e.external),
      e.external ||
        (Object.keys(o).length > 0 &&
          (e.target === `draft-2020-12` ? (i.$defs = o) : (i.definitions = o))))
    try {
      let n = JSON.parse(JSON.stringify(i))
      return (
        Object.defineProperty(n, '~standard', {
          value: {
            ...t[`~standard`],
            jsonSchema: {
              input: Wa(t, `input`, e.processors),
              output: Wa(t, `output`, e.processors),
            },
          },
          enumerable: !1,
          writable: !1,
        }),
        n
      )
    } catch {
      throw Error(`Error converting schema to JSON.`)
    }
  }
  function z(e, t) {
    let n = t ?? { seen: /* @__PURE__ */ new Set() }
    if (n.seen.has(e)) return !1
    n.seen.add(e)
    let r = e._zod.def
    if (r.type === `transform`) return !0
    if (r.type === `array`) return z(r.element, n)
    if (r.type === `set`) return z(r.valueType, n)
    if (r.type === `lazy`) return z(r.getter(), n)
    if (
      r.type === `promise` ||
      r.type === `optional` ||
      r.type === `nonoptional` ||
      r.type === `nullable` ||
      r.type === `readonly` ||
      r.type === 'default' ||
      r.type === `prefault` ||
      r.type === `catch`
    )
      return z(r.innerType, n)
    if (r.type === `intersection`) return z(r.left, n) || z(r.right, n)
    if (r.type === `record` || r.type === `map`) return z(r.keyType, n) || z(r.valueType, n)
    if (r.type === `pipe`) return e._zod.traits.has(`$ZodCodec`) ? !0 : z(r.in, n) || z(r.out, n)
    if (r.type === `object`) {
      for (let e in r.shape) if (z(r.shape[e], n)) return !0
      return !1
    }
    if (r.type === `union`) {
      for (let e of r.options) if (z(e, n)) return !0
      return !1
    }
    if (r.type === `tuple`) {
      for (let e of r.items) if (z(e, n)) return !0
      return !!(r.rest && z(r.rest, n))
    }
    return !1
  }
  let Ua =
      (e, t = {}) =>
      (n) => {
        let r = Na({ ...n, processors: t })
        return (R(e, r), Fa(r, e), Ha(r, e))
      },
    Wa =
      (e, t, n = {}) =>
      (r) => {
        let { libraryOptions: i, target: a } = r ?? {},
          o = Na({ ...(i ?? {}), target: a, io: t, processors: n })
        return (R(e, o), Fa(o, e), Ha(o, e))
      },
    B = (e, t, n) => {
      ;(e[t] === void 0 || n > e[t]) && (e[t] = n)
    },
    V = (e, t, n) => {
      ;(e[t] === void 0 || n < e[t]) && (e[t] = n)
    },
    Ga = (e, t) => {
      ;(B(e, `minimum`, t), V(e, `maximum`, t))
    },
    Ka = (e, t) => {
      ;((e.multipleOf ??= []), e.multipleOf.includes(t) || e.multipleOf.push(t))
    },
    qa = (e, t) => {
      ;((e.patterns ??= /* @__PURE__ */ new Set()), e.patterns.add(t))
    },
    Ja = (e, t) => {
      e.mime = e.mime ? e.mime.filter((e) => t.includes(e)) : [...t]
    },
    Ya = (e, t) => {
      ;((e.format = t), t.includes(`int`) && (e.isInt = !0))
    },
    Xa = (e, t) => B(e, `minimum`, t.minimum),
    Za = (e, t) => V(e, `maximum`, t.maximum),
    Qa = (e) => (t, n) => {
      Ya(t, n.format)
      let [r, i] = e[n.format]
      ;(B(t, `minimum`, r), V(t, `maximum`, i))
    },
    $a = {
      greater_than: (e, t) => B(e, t.inclusive ? `minimum` : `exclusiveMinimum`, t.value),
      less_than: (e, t) => V(e, t.inclusive ? `maximum` : `exclusiveMaximum`, t.value),
      multiple_of: (e, t) => Ka(e, t.value),
      number_format: Qa(Te),
      bigint_format: Qa(Ee),
      min_length: Xa,
      max_length: Za,
      length_equals: (e, t) => Ga(e, t.length),
      min_size: Xa,
      max_size: Za,
      size_equals: (e, t) => Ga(e, t.size),
      string_format: (e, t) => {
        ;(Ya(e, t.format),
          t.pattern && qa(e, t.pattern),
          (t.format === `base64` || t.format === `base64url`) && (e.contentEncoding = t.format),
          (t.local || t.precision === -1) && (e.laxFormat = !0))
      },
      mime_type: (e, t) => Ja(e, t.mime),
    }
  function H(e) {
    let t = {},
      n = e._zod.def,
      r = e._zod.traits.has(`$ZodCheck`) ? [e, ...(n.checks ?? [])] : (n.checks ?? [])
    for (let e of r) $a[e._zod.def.check]?.(t, e._zod.def)
    let i = e._zod.bag
    ;(i.minimum !== void 0 && B(t, `minimum`, i.minimum),
      i.exclusiveMinimum !== void 0 && B(t, `exclusiveMinimum`, i.exclusiveMinimum),
      i.maximum !== void 0 && V(t, `maximum`, i.maximum),
      i.exclusiveMaximum !== void 0 && V(t, `exclusiveMaximum`, i.exclusiveMaximum),
      i.multipleOf !== void 0 && Ka(t, i.multipleOf),
      i.format !== void 0 && ((t.format ??= i.format), i.format.includes(`int`) && (t.isInt = !0)),
      i.mime && Ja(t, i.mime))
    for (let e of i.patterns ?? []) qa(t, e)
    return t
  }
  let eo = {
      guid: `uuid`,
      url: `uri`,
      datetime: `date-time`,
      json_string: `json-string`,
      regex: ``,
    },
    to = /* @__PURE__ */ new Map([
      [fr, Zt],
      [mr, Qt],
    ]),
    no = (e) => to.get(e) ?? e,
    ro = (e, t, n, r) => {
      let i = n
      i.type = `string`
      let {
        minimum: a,
        maximum: o,
        format: s,
        patterns: c,
        contentEncoding: l,
        laxFormat: u,
      } = H(e)
      if (
        (typeof a == `number` && (i.minLength = a),
        typeof o == `number` && (i.maxLength = o),
        s &&
          ((i.format = eo[s] ?? s),
          i.format === `` && delete i.format,
          (s === `time` || u) && delete i.format),
        l && (i.contentEncoding = l),
        c && c.size > 0)
      ) {
        let e = [...c].map(no)
        e.length === 1
          ? (i.pattern = e[0].source)
          : e.length > 1 &&
            (i.allOf = [
              ...e.map((e) => ({
                ...(t.target === `draft-07` || t.target === `draft-04` || t.target === `openapi-3.0`
                  ? { type: `string` }
                  : {}),
                pattern: e.source,
              })),
            ])
      }
    },
    io = (e, t, n, r) => {
      let i = n,
        {
          minimum: a,
          maximum: o,
          multipleOf: s,
          exclusiveMaximum: c,
          exclusiveMinimum: l,
          isInt: u,
        } = H(e)
      i.type = u ? `integer` : `number`
      let d = typeof l == `number` && l >= (a ?? -1 / 0),
        f = typeof c == `number` && c <= (o ?? 1 / 0),
        p = t.target === `draft-04` || t.target === `openapi-3.0`
      if (
        (d
          ? p
            ? ((i.minimum = l), (i.exclusiveMinimum = !0))
            : (i.exclusiveMinimum = l)
          : typeof a == `number` && (i.minimum = a),
        f
          ? p
            ? ((i.maximum = c), (i.exclusiveMaximum = !0))
            : (i.exclusiveMaximum = c)
          : typeof o == `number` && (i.maximum = o),
        s)
      ) {
        let n = /* @__PURE__ */ new Set()
        for (let a of s)
          Number.isFinite(a) && a !== 0
            ? n.add(Math.abs(a))
            : L(e, t, i, r, `A multipleOf divisor of ${a} cannot be represented in JSON Schema`)
        let [a, ...o] = n
        ;(a !== void 0 && (i.multipleOf = a),
          o.length && (i.allOf = [...(i.allOf ?? []), ...o.map((e) => ({ multipleOf: e }))]))
      }
    },
    ao = (e, t, n, r) => {
      n.type = `boolean`
    },
    oo = (e, t, n, r) => {
      n.not = {}
    },
    so = (e, t, n, r) => {
      let i = e._zod.def,
        a = ae(i.entries)
      a.length === 0
        ? (n.not = {})
        : (a.every((e) => typeof e == `number`) && (n.type = `number`),
          a.every((e) => typeof e == `string`) && (n.type = `string`),
          (n.enum = a))
    },
    co = (e, t, n, r) => {
      let i = e._zod.def
      if (i.values.length === 0) {
        n.not = {}
        return
      }
      let a = []
      for (let o of i.values)
        if (o === void 0) {
          if (L(e, t, n, r, 'Literal `undefined` cannot be represented in JSON Schema')) return
        } else if (typeof o == `bigint`) {
          if (L(e, t, n, r, `BigInt literals cannot be represented in JSON Schema`)) return
          a.push(Number(o))
        } else a.push(o)
      if (a.length !== 0) {
        if (a.length === 1) {
          let e = a[0]
          ;((n.type = e === null ? `null` : typeof e),
            t.target === `draft-04` || t.target === `openapi-3.0` ? (n.enum = [e]) : (n.const = e))
        } else
          (a.every((e) => typeof e == `number`) && (n.type = `number`),
            a.every((e) => typeof e == `string`) && (n.type = `string`),
            a.every((e) => typeof e == `boolean`) && (n.type = `boolean`),
            a.every((e) => e === null) && (n.type = `null`),
            (n.enum = a))
      }
    },
    lo = (e, t, n, r) => {
      L(e, t, n, r, `Custom types cannot be represented in JSON Schema`)
    },
    uo = (e, t, n, r) => {
      L(e, t, n, r, `Transforms cannot be represented in JSON Schema`)
    },
    fo = (e, t, n, r) => {
      let i = n,
        a = e._zod.def,
        { minimum: o, maximum: s } = H(e)
      ;(typeof o == `number` && (i.minItems = o),
        typeof s == `number` && (i.maxItems = s),
        (i.type = `array`),
        (i.items = R(a.element, t, { ...r, path: [...r.path, `items`] })))
    }
  function po(e) {
    let t = e._zod.def
    return t.type === `pipe` && t.in._zod.traits.has(`$ZodTransform`)
      ? po(t.out)
      : t.type === `catch`
        ? po(t.innerType)
        : e._zod.optin
  }
  let mo = (e, t, n, r) => {
      let i = n,
        a = e._zod.def,
        o = a.shape
      if (
        Object.getOwnPropertySymbols(o).length &&
        L(e, t, i, r, `Symbol keys cannot be represented in JSON Schema`)
      )
        return
      ;((i.type = `object`), (i.properties = {}))
      for (let e in o) g(i.properties, e, R(o[e], t, { ...r, path: [...r.path, `properties`, e] }))
      let s = []
      for (let e of Object.keys(o)) {
        let n = a.shape[e]
        ;(t.io === `input` ? po(n) === void 0 : n._zod.optout === void 0) && s.push(e)
      }
      ;(s.length > 0 && (i.required = s),
        a.catchall?._zod.def.type === `never`
          ? (i.additionalProperties = !1)
          : a.catchall
            ? a.catchall &&
              (i.additionalProperties = R(a.catchall, t, {
                ...r,
                path: [...r.path, `additionalProperties`],
              }))
            : t.io === `output` && (i.additionalProperties = !1))
    },
    ho = (e, t, n, r) => {
      let i = e._zod.def,
        a = i.inclusive === !1,
        o = i.options.map((e, n) => R(e, t, { ...r, path: [...r.path, a ? `oneOf` : `anyOf`, n] }))
      a ? (n.oneOf = o) : (n.anyOf = o)
    },
    go = (e, t, n, r) => {
      let i = e._zod.def,
        a = R(i.left, t, { ...r, path: [...r.path, `allOf`, 0] }),
        o = R(i.right, t, { ...r, path: [...r.path, `allOf`, 1] }),
        s = (e) => `allOf` in e && Object.keys(e).length === 1,
        c = [...(s(a) ? a.allOf : [a]), ...(s(o) ? o.allOf : [o])]
      ;((n.allOf = c), t.intersections.push(c))
    },
    _o = (e, t, n, r) => {
      let i = e._zod.def,
        a = R(i.innerType, t, r),
        o = t.seen.get(e)
      t.target === `openapi-3.0`
        ? ((o.ref = i.innerType), (n.nullable = !0))
        : (n.anyOf = [a, { type: `null` }])
    },
    vo = (e, t, n, r) => {
      let i = e._zod.def
      R(i.innerType, t, r)
      let a = t.seen.get(e)
      a.ref = i.innerType
    },
    yo = Symbol()
  function bo(e, t, n, r, i) {
    let a = !1,
      o = JSON.stringify(e, (e, t) => (typeof t == `bigint` ? ((a = !0), null) : t))
    return a
      ? (L(t, n, r, i, `BigInt defaults cannot be represented in JSON Schema`), yo)
      : JSON.parse(o)
  }
  let xo = (e, t, n, r) => {
      let i = e._zod.def
      R(i.innerType, t, r)
      let a = t.seen.get(e)
      a.ref = i.innerType
      let o = bo(i.defaultValue, e, t, n, r)
      o !== yo && (n.default = o)
    },
    So = (e, t, n, r) => {
      let i = e._zod.def
      R(i.innerType, t, r)
      let a = t.seen.get(e)
      if (((a.ref = i.innerType), t.io !== `input`)) return
      let o = bo(i.defaultValue, e, t, n, r)
      o !== yo && (n._prefault = o)
    },
    Co = (e, t, n, r) => {
      let i = e._zod.def
      R(i.innerType, t, r)
      let a = t.seen.get(e)
      a.ref = i.innerType
      let o
      try {
        o = i.catchValue(void 0)
      } catch {
        L(e, t, n, r, `Dynamic catch values are not supported in JSON Schema`)
        return
      }
      n.default = o
    },
    wo = (e, t, n, r) => {
      let i = e._zod.def,
        a = i.in._zod.traits.has(`$ZodTransform`),
        o = t.io === `input` ? (a ? i.out : i.in) : i.out
      R(o, t, r)
      let s = t.seen.get(e)
      s.ref = o
    },
    To = (e, t, n, r) => {
      let i = e._zod.def
      R(i.innerType, t, r)
      let a = t.seen.get(e)
      ;((a.ref = i.innerType), (n.readOnly = !0))
    },
    Eo = (e, t, n, r) => {
      let i = e._zod.def
      R(i.innerType, t, r)
      let a = t.seen.get(e)
      a.ref = i.innerType
    },
    Do = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype])
  function Oo(e, t, n) {
    Object.defineProperty(e, t, {
      configurable: !0,
      enumerable: !1,
      get() {
        let e = n(this)
        return (Object.defineProperty(this, t, { value: e, configurable: !0, writable: !0 }), e)
      },
      set(e) {
        Object.defineProperty(this, t, { value: e, configurable: !0, writable: !0 })
      },
    })
  }
  let U = /*@__PURE__*/ k(
      `ZodError`,
      (e, t) => {
        ;(ft.init(e, t), (e.name = `ZodError`))
        let n = Object.getPrototypeOf(e)
        Do.has(n) ||
          (Do.add(n),
          Oo(n, `format`, (e) => (t) => ht(e, t)),
          Oo(n, `flatten`, (e) => (t) => mt(e, t)),
          Oo(n, `addIssue`, (e) => (t) => {
            ;(e.issues.push(t), (e.message = JSON.stringify(e.issues, se, 2)))
          }),
          Oo(n, `addIssues`, (e) => (t) => {
            ;(e.issues.push(...t), (e.message = JSON.stringify(e.issues, se, 2)))
          }),
          Object.defineProperty(n, 'isEmpty', {
            configurable: !0,
            enumerable: !1,
            get() {
              return this.issues.length === 0
            },
          }))
      },
      void 0,
      { Parent: Error },
    ),
    ko = /* @__PURE__ */ _t(U),
    Ao = /* @__PURE__ */ vt(U),
    jo = /* @__PURE__ */ yt(U),
    Mo = /* @__PURE__ */ xt(U),
    No = /* @__PURE__ */ Dt(U),
    Po = /* @__PURE__ */ Ot(U),
    Fo = /* @__PURE__ */ kt(U),
    Io = /* @__PURE__ */ At(U),
    Lo = /* @__PURE__ */ jt(U),
    Ro = /* @__PURE__ */ Mt(U),
    zo = /* @__PURE__ */ Nt(U),
    Bo = /* @__PURE__ */ Pt(U)
  function Vo() {
    j.localeError || M(wi())
  }
  function Ho() {
    j.memoizer || M({ memoizer: xi() })
  }
  let W = /*@__PURE__*/ k(
      `ZodType`,
      (e, t) => (Vo(), P.init(e, t), (e.def = t), (e.type = t.type), e),
      {
        check(...e) {
          let t = this.def
          return this.clone(
            b(t, {
              checks: [
                ...(t.checks ?? []),
                ...e.map((e) =>
                  typeof e == `function`
                    ? { _zod: { check: e, def: { check: `custom` }, onattach: [] } }
                    : e,
                ),
              ],
            }),
            { parent: !0 },
          )
        },
        with(...e) {
          return this.check(...e)
        },
        clone(e, t) {
          return S(this, e, t)
        },
        brand() {
          return this
        },
        register(e, t) {
          return (e.add(this, t), this)
        },
        refine(e, t) {
          return this.check(ac(e, t))
        },
        superRefine(e, t) {
          return this.check(oc(e, t))
        },
        overwrite(e) {
          return this.check(/* @__PURE__ */ I(e))
        },
        optional() {
          return Bs(this)
        },
        exactOptional() {
          return Hs(this)
        },
        nullable() {
          return Ws(this)
        },
        nullish() {
          return Bs(Ws(this))
        },
        nonoptional(e) {
          return Xs(this, e)
        },
        array() {
          return q(this)
        },
        or(e) {
          return Os([this, e])
        },
        and(e) {
          return Ms(this, e)
        },
        transform(e) {
          return ec(this, Rs(e))
        },
        default(e) {
          return Ks(this, e)
        },
        prefault(e) {
          return Js(this, e)
        },
        catch(e) {
          return Qs(this, e)
        },
        pipe(e) {
          return ec(this, e)
        },
        readonly() {
          return rc(this)
        },
        describe(e) {
          let t = this.clone()
          return (Oi.add(t, { description: e }), t)
        },
        meta(...e) {
          if (e.length === 0) return Oi.get(this)
          let t = this.clone()
          return (Oi.add(t, e[0]), t)
        },
        isOptional() {
          return this.safeParse(void 0).success
        },
        isNullable() {
          return this.safeParse(null).success
        },
        apply(e, ...t) {
          return t.length === 0 ? e(this) : e(this, ...t)
        },
        get '~standard'() {
          return qe(this, `~standard`, {
            ...Pn(this),
            jsonSchema: { input: Wa(this, `input`), output: Wa(this, `output`) },
          })
        },
        set '~standard'(e) {
          E(this, `~standard`, e)
        },
        parse: function e(t, n) {
          return ko(this, t, n, { callee: e })
        },
        parseAsync: async function e(t, n) {
          return await Ao(this, t, n, { callee: e })
        },
        safeParse(e, t) {
          return jo(this, e, t)
        },
        async safeParseAsync(e, t) {
          return Mo(this, e, t)
        },
        get spa() {
          return this?.safeParseAsync
        },
        set spa(e) {
          E(this, `spa`, e)
        },
        validate(e, t) {
          return wt(this, e, t)
        },
        validateAsync(e, t) {
          return Et(this, e, t)
        },
        encode: function e(t, n) {
          return No(this, t, n, { callee: e })
        },
        decode: function e(t, n) {
          return Po(this, t, n, { callee: e })
        },
        encodeAsync: async function e(t, n) {
          return await Fo(this, t, n, { callee: e })
        },
        decodeAsync: async function e(t, n) {
          return await Io(this, t, n, { callee: e })
        },
        safeEncode(e, t) {
          return Lo(this, e, t)
        },
        safeDecode(e, t) {
          return Ro(this, e, t)
        },
        async safeEncodeAsync(e, t) {
          return zo(this, e, t)
        },
        async safeDecodeAsync(e, t) {
          return Bo(this, e, t)
        },
        toJSONSchema(e) {
          return Ua(this, {})(e)
        },
        get description() {
          return Oi.get(this)?.description
        },
        get _def() {
          return this._zod.def
        },
      },
    ),
    Uo = /*@__PURE__*/ k(
      `_ZodString`,
      (e, t) => {
        ;(Fn.init(e, t), W.init(e, t), (e._zod.processJSONSchema = (t, n, r) => ro(e, t, n, r)))
      },
      /*@__PURE__*/ Je(
        {
          format: (e) => H(e).format ?? null,
          minLength: (e) => H(e).minimum ?? null,
          maxLength: (e) => H(e).maximum ?? null,
        },
        {
          regex(...e) {
            return this.check(/* @__PURE__ */ _a(...e))
          },
          includes(...e) {
            return this.check(/* @__PURE__ */ ba(...e))
          },
          startsWith(...e) {
            return this.check(/* @__PURE__ */ xa(...e))
          },
          endsWith(...e) {
            return this.check(/* @__PURE__ */ Sa(...e))
          },
          min(...e) {
            return this.check(/* @__PURE__ */ ha(...e))
          },
          max(...e) {
            return this.check(/* @__PURE__ */ ma(...e))
          },
          length(...e) {
            return this.check(/* @__PURE__ */ ga(...e))
          },
          nonempty(...e) {
            return this.check(/* @__PURE__ */ ha(1, ...e))
          },
          lowercase(e) {
            return this.check(/* @__PURE__ */ va(e))
          },
          uppercase(e) {
            return this.check(/* @__PURE__ */ ya(e))
          },
          trim() {
            return this.check(/* @__PURE__ */ wa())
          },
          normalize(...e) {
            return this.check(/* @__PURE__ */ Ca(...e))
          },
          toLowerCase() {
            return this.check(/* @__PURE__ */ Ta())
          },
          toUpperCase() {
            return this.check(/* @__PURE__ */ Ea())
          },
          slugify() {
            return this.check(/* @__PURE__ */ Da())
          },
        },
      ),
    ),
    Wo = /*@__PURE__*/ k(
      `ZodString`,
      (e, t) => {
        ;(Fn.init(e, t), Uo.init(e, t))
      },
      {
        email(e) {
          return this.check(/* @__PURE__ */ ji(Yo, e))
        },
        url(e) {
          return this.check(/* @__PURE__ */ Li($o, e))
        },
        jwt(e) {
          return this.check(/* @__PURE__ */ Qi(ms, e))
        },
        emoji(e) {
          return this.check(/* @__PURE__ */ Ri(es, e))
        },
        guid(e) {
          return this.check(/* @__PURE__ */ Mi(Xo, e))
        },
        uuid(e) {
          return this.check(/* @__PURE__ */ Ni(Zo, e))
        },
        uuidv4(e) {
          return this.check(/* @__PURE__ */ Pi(Zo, e))
        },
        uuidv6(e) {
          return this.check(/* @__PURE__ */ Fi(Zo, e))
        },
        uuidv7(e) {
          return this.check(/* @__PURE__ */ Ii(Zo, e))
        },
        nanoid(e) {
          return this.check(/* @__PURE__ */ zi(ts, e))
        },
        cuid(e) {
          return this.check(/* @__PURE__ */ Bi(ns, e))
        },
        cuid2(e) {
          return this.check(/* @__PURE__ */ Vi(rs, e))
        },
        ulid(e) {
          return this.check(/* @__PURE__ */ Hi(is, e))
        },
        base64(e) {
          return this.check(/* @__PURE__ */ Yi(ds, e))
        },
        base64url(e) {
          return this.check(/* @__PURE__ */ Xi(fs, e))
        },
        xid(e) {
          return this.check(/* @__PURE__ */ Ui(as, e))
        },
        ksuid(e) {
          return this.check(/* @__PURE__ */ Wi(os, e))
        },
        ipv4(e) {
          return this.check(/* @__PURE__ */ Gi(ss, e))
        },
        ipv6(e) {
          return this.check(/* @__PURE__ */ Ki(cs, e))
        },
        cidrv4(e) {
          return this.check(/* @__PURE__ */ qi(ls, e))
        },
        cidrv6(e) {
          return this.check(/* @__PURE__ */ Ji(us, e))
        },
        e164(e) {
          return this.check(/* @__PURE__ */ Zi(ps, e))
        },
        datetime(e) {
          return this.check(/* @__PURE__ */ $i(Go, e))
        },
        date(e) {
          return this.check(/* @__PURE__ */ ea(Ko, e))
        },
        time(e) {
          return this.check(/* @__PURE__ */ ta(qo, e))
        },
        duration(e) {
          return this.check(/* @__PURE__ */ na(Jo, e))
        },
      },
    )
  function G(e) {
    return /* @__PURE__ */ Ai(Wo, e)
  }
  let K = /*@__PURE__*/ k(`ZodStringFormat`, (e, t) => {
      ;(F.init(e, t), Uo.init(e, t))
    }),
    Go = /*@__PURE__*/ k(`ZodISODateTime`, (e, t) => {
      ;(er.init(e, t), K.init(e, t))
    }),
    Ko = /*@__PURE__*/ k(`ZodISODate`, (e, t) => {
      ;(tr.init(e, t), K.init(e, t))
    }),
    qo = /*@__PURE__*/ k(`ZodISOTime`, (e, t) => {
      ;(nr.init(e, t), K.init(e, t))
    }),
    Jo = /*@__PURE__*/ k(`ZodISODuration`, (e, t) => {
      ;(rr.init(e, t), K.init(e, t))
    }),
    Yo = /*@__PURE__*/ k(`ZodEmail`, (e, t) => {
      ;(Rn.init(e, t), K.init(e, t))
    }),
    Xo = /*@__PURE__*/ k(`ZodGUID`, (e, t) => {
      ;(In.init(e, t), K.init(e, t))
    }),
    Zo = /*@__PURE__*/ k(`ZodUUID`, (e, t) => {
      ;(Ln.init(e, t), K.init(e, t))
    })
  function Qo(e) {
    return /* @__PURE__ */ Ni(Zo, e)
  }
  let $o = /*@__PURE__*/ k(`ZodURL`, (e, t) => {
      ;(Kn.init(e, t), K.init(e, t))
    }),
    es = /*@__PURE__*/ k(`ZodEmoji`, (e, t) => {
      ;(qn.init(e, t), K.init(e, t))
    }),
    ts = /*@__PURE__*/ k(`ZodNanoID`, (e, t) => {
      ;(Jn.init(e, t), K.init(e, t))
    }),
    ns = /*@__PURE__*/ k(`ZodCUID`, (e, t) => {
      ;(Yn.init(e, t), K.init(e, t))
    }),
    rs = /*@__PURE__*/ k(`ZodCUID2`, (e, t) => {
      ;(Xn.init(e, t), K.init(e, t))
    }),
    is = /*@__PURE__*/ k(`ZodULID`, (e, t) => {
      ;(Zn.init(e, t), K.init(e, t))
    }),
    as = /*@__PURE__*/ k(`ZodXID`, (e, t) => {
      ;(Qn.init(e, t), K.init(e, t))
    }),
    os = /*@__PURE__*/ k(`ZodKSUID`, (e, t) => {
      ;($n.init(e, t), K.init(e, t))
    }),
    ss = /*@__PURE__*/ k(`ZodIPv4`, (e, t) => {
      ;(ir.init(e, t), K.init(e, t))
    }),
    cs = /*@__PURE__*/ k(`ZodIPv6`, (e, t) => {
      ;(sr.init(e, t), K.init(e, t))
    }),
    ls = /*@__PURE__*/ k(`ZodCIDRv4`, (e, t) => {
      ;(cr.init(e, t), K.init(e, t))
    }),
    us = /*@__PURE__*/ k(`ZodCIDRv6`, (e, t) => {
      ;(ur.init(e, t), K.init(e, t))
    }),
    ds = /*@__PURE__*/ k(`ZodBase64`, (e, t) => {
      ;(pr.init(e, t), K.init(e, t))
    }),
    fs = /*@__PURE__*/ k(`ZodBase64URL`, (e, t) => {
      ;(gr.init(e, t), K.init(e, t))
    }),
    ps = /*@__PURE__*/ k(`ZodE164`, (e, t) => {
      ;(_r.init(e, t), K.init(e, t))
    }),
    ms = /*@__PURE__*/ k(`ZodJWT`, (e, t) => {
      ;(yr.init(e, t), K.init(e, t))
    }),
    hs = /*@__PURE__*/ k(
      `ZodNumber`,
      (e, t) => {
        ;(br.init(e, t),
          W.init(e, t),
          (e._zod.processJSONSchema = (t, n, r) => io(e, t, n, r)),
          (e.isFinite = !0))
      },
      /*@__PURE__*/ Je(
        {
          minValue: (e) => {
            let { minimum: t, exclusiveMinimum: n } = H(e)
            return Math.max(t ?? -1 / 0, n ?? -1 / 0)
          },
          maxValue: (e) => {
            let { maximum: t, exclusiveMaximum: n } = H(e)
            return Math.min(t ?? 1 / 0, n ?? 1 / 0)
          },
          isInt: (e) => {
            let { isInt: t, multipleOf: n } = H(e)
            return !!t || !!n?.some(Number.isSafeInteger)
          },
          format: (e) => H(e).format ?? null,
        },
        {
          gt(e, t) {
            return this.check(/* @__PURE__ */ da(e, t))
          },
          gte(e, t) {
            return this.check(/* @__PURE__ */ fa(e, t))
          },
          min(e, t) {
            return this.check(/* @__PURE__ */ fa(e, t))
          },
          lt(e, t) {
            return this.check(/* @__PURE__ */ la(e, t))
          },
          lte(e, t) {
            return this.check(/* @__PURE__ */ ua(e, t))
          },
          max(e, t) {
            return this.check(/* @__PURE__ */ ua(e, t))
          },
          int(e) {
            return this.check(vs(e))
          },
          safe(e) {
            return this.check(vs(e))
          },
          positive(e) {
            return this.check(/* @__PURE__ */ da(0, e))
          },
          nonnegative(e) {
            return this.check(/* @__PURE__ */ fa(0, e))
          },
          negative(e) {
            return this.check(/* @__PURE__ */ la(0, e))
          },
          nonpositive(e) {
            return this.check(/* @__PURE__ */ ua(0, e))
          },
          multipleOf(e, t) {
            return this.check(/* @__PURE__ */ pa(e, t))
          },
          step(e, t) {
            return this.check(/* @__PURE__ */ pa(e, t))
          },
          finite() {
            return this
          },
        },
      ),
    )
  function gs(e) {
    return /* @__PURE__ */ ra(hs, e)
  }
  let _s = /*@__PURE__*/ k(`ZodNumberFormat`, (e, t) => {
    ;(xr.init(e, t), hs.init(e, t))
  })
  function vs(e) {
    return /* @__PURE__ */ aa(_s, e)
  }
  let ys = /*@__PURE__*/ k(`ZodBoolean`, (e, t) => {
    ;(Sr.init(e, t), W.init(e, t), (e._zod.processJSONSchema = (t, n, r) => ao(e, t, n, r)))
  })
  function bs(e) {
    return /* @__PURE__ */ oa(ys, e)
  }
  let xs = /*@__PURE__*/ k(`ZodUnknown`, (e, t) => {
    ;(Cr.init(e, t), W.init(e, t), (e._zod.processJSONSchema = (e, t, n) => void 0))
  })
  function Ss() {
    return /* @__PURE__ */ sa(xs)
  }
  let Cs = /*@__PURE__*/ k(`ZodNever`, (e, t) => {
    ;(wr.init(e, t), W.init(e, t), (e._zod.processJSONSchema = (t, n, r) => oo(e, t, n, r)))
  })
  function ws(e) {
    return /* @__PURE__ */ ca(Cs, e)
  }
  let Ts = /*@__PURE__*/ k(
    `ZodArray`,
    (e, t) => {
      ;(Ho(),
        Or.init(e, t),
        W.init(e, t),
        (e._zod.processJSONSchema = (t, n, r) => fo(e, t, n, r)),
        (e.element = t.element))
    },
    {
      min(e, t) {
        return this.check(/* @__PURE__ */ ha(e, t))
      },
      nonempty(e) {
        return this.check(/* @__PURE__ */ ha(1, e))
      },
      max(e, t) {
        return this.check(/* @__PURE__ */ ma(e, t))
      },
      length(e, t) {
        return this.check(/* @__PURE__ */ ga(e, t))
      },
      unwrap() {
        return this.element
      },
    },
  )
  function q(e, t) {
    return /* @__PURE__ */ Oa(Ts, e, t)
  }
  let Es = /*@__PURE__*/ k(
    `ZodObject`,
    (e, t) => {
      ;(Ho(),
        Pr.init(e, t),
        W.init(e, t),
        (e._zod.processJSONSchema = (t, n, r) => mo(e, t, n, r)),
        $e(e, `shape`, (e) => e._zod.def.shape, !1))
    },
    {
      keyof() {
        return Ps(Object.keys(this._zod.def.shape))
      },
      catchall(e) {
        return this.clone(b(this._zod.def, { catchall: e }))
      },
      passthrough() {
        return this.clone(b(this._zod.def, { catchall: Ss() }))
      },
      loose() {
        return this.clone(b(this._zod.def, { catchall: Ss() }))
      },
      strict() {
        return this.clone(b(this._zod.def, { catchall: ws() }))
      },
      strip() {
        return this.clone(b(this._zod.def, { catchall: void 0 }))
      },
      extend(e) {
        return Ae(this, e)
      },
      safeExtend(e) {
        return Me(this, e)
      },
      merge(e) {
        return Ne(this, e)
      },
      pick(e) {
        return De(this, e)
      },
      omit(e) {
        return ke(this, e)
      },
      partial(...e) {
        return Pe(zs, this, e[0])
      },
      exactPartial(...e) {
        return Pe(Vs, this, e[0], `exactPartial`)
      },
      required(...e) {
        return Fe(Ys, this, e[0])
      },
    },
  )
  function J(e, t) {
    return new Es({ type: `object`, shape: e, catchall: ws(), ...C(t) })
  }
  let Ds = /*@__PURE__*/ k(`ZodUnion`, (e, t) => {
    ;(Ir.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => ho(e, t, n, r)),
      (e.options = t.options))
  })
  function Os(e, t) {
    return new Ds({ type: `union`, options: e, ...C(t) })
  }
  let ks = /*@__PURE__*/ k(`ZodDiscriminatedUnion`, (e, t) => {
    ;(Ds.init(e, t), Rr.init(e, t))
  })
  function As(e, t, n) {
    return new ks({ type: `union`, options: t, discriminator: e, ...C(n) })
  }
  let js = /*@__PURE__*/ k(`ZodIntersection`, (e, t) => {
    ;(zr.init(e, t), W.init(e, t), (e._zod.processJSONSchema = (t, n, r) => go(e, t, n, r)))
  })
  function Ms(e, t) {
    return new js({ type: `intersection`, left: e, right: t })
  }
  let Ns = /*@__PURE__*/ k(`ZodEnum`, (e, t) => {
    ;(Hr.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => so(e, t, n, r)),
      (e.enum = t.entries),
      (e.options = [...e._zod.values]))
    let n = new Set(Object.keys(t.entries))
    ;((e.extract = (e, r) => {
      let i = {}
      for (let r of e)
        if (n.has(r)) i[r] = t.entries[r]
        else throw Error(`Key ${r} not found in enum`)
      return new Ns({ ...t, checks: [], ...C(r), entries: i })
    }),
      (e.exclude = (e, r) => {
        let i = { ...t.entries }
        for (let t of e)
          if (n.has(t)) delete i[t]
          else throw Error(`Key ${t} not found in enum`)
        return new Ns({ ...t, checks: [], ...C(r), entries: i })
      }))
  })
  function Ps(e, t) {
    let n = Array.isArray(e) ? Object.fromEntries(e.map((e) => [e, e])) : e
    return new Ns({ type: `enum`, entries: n, ...C(t) })
  }
  let Fs = /*@__PURE__*/ k(`ZodLiteral`, (e, t) => {
    ;(Ur.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => co(e, t, n, r)),
      (e.values = new Set(t.values)),
      Object.defineProperty(e, 'value', {
        get() {
          if (t.values.length > 1)
            throw Error(
              'This schema contains multiple valid literal values. Use `.values` instead.',
            )
          return t.values[0]
        },
      }))
  })
  function Is(e, t) {
    return new Fs({ type: `literal`, values: Array.isArray(e) ? e : [e], ...C(t) })
  }
  let Ls = /*@__PURE__*/ k(`ZodTransform`, (e, t) => {
    ;(Ho(),
      Wr.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => uo(e, t, n, r)),
      (e._zod.parse = (n, r) => {
        if (r.direction === `backward`) throw new at(e.constructor.name)
        n.addIssue = (r) => {
          if (typeof r == `string`) n.issues.push(Ge(r, n.value, t))
          else {
            let t = r
            ;(t.fatal && (t.continue = !1),
              (t.code ??= `custom`),
              `input` in t || (t.input = n.value),
              (t.inst ??= e),
              n.issues.push(Ge(t)))
          }
        }
        let i = t.transform(n.value, n)
        return i instanceof Promise ? i.then((e) => ((n.value = e), n)) : ((n.value = i), n)
      }))
  })
  function Rs(e) {
    return new Ls({ type: `transform`, transform: e })
  }
  let zs = /*@__PURE__*/ k(`ZodOptional`, (e, t) => {
    ;(Kr.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => Eo(e, t, n, r)),
      (e.unwrap = () => e._zod.def.innerType))
  })
  function Bs(e) {
    return new zs({ type: `optional`, innerType: e })
  }
  let Vs = /*@__PURE__*/ k(`ZodExactOptional`, (e, t) => {
    ;(qr.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => Eo(e, t, n, r)),
      (e.unwrap = () => e._zod.def.innerType))
  })
  function Hs(e) {
    return new Vs({ type: `optional`, innerType: e })
  }
  let Us = /*@__PURE__*/ k(`ZodNullable`, (e, t) => {
    ;(Jr.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => _o(e, t, n, r)),
      (e.unwrap = () => e._zod.def.innerType))
  })
  function Ws(e) {
    return new Us({ type: `nullable`, innerType: e })
  }
  let Gs = /*@__PURE__*/ k(`ZodDefault`, (e, t) => {
    ;(Yr.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => xo(e, t, n, r)),
      (e.unwrap = () => e._zod.def.innerType),
      (e.removeDefault = e.unwrap))
  })
  function Ks(e, t) {
    return new Gs({
      type: `default`,
      innerType: e,
      get defaultValue() {
        return typeof t == `function` ? t() : xe(t)
      },
    })
  }
  let qs = /*@__PURE__*/ k(`ZodPrefault`, (e, t) => {
    ;(Zr.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => So(e, t, n, r)),
      (e.unwrap = () => e._zod.def.innerType))
  })
  function Js(e, t) {
    return new qs({
      type: `prefault`,
      innerType: e,
      get defaultValue() {
        return typeof t == `function` ? t() : xe(t)
      },
    })
  }
  let Ys = /*@__PURE__*/ k(`ZodNonOptional`, (e, t) => {
    ;(Qr.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => vo(e, t, n, r)),
      (e.unwrap = () => e._zod.def.innerType))
  })
  function Xs(e, t) {
    return new Ys({ type: `nonoptional`, innerType: e, ...C(t) })
  }
  let Zs = /*@__PURE__*/ k(`ZodCatch`, (e, t) => {
    ;(ti.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => Co(e, t, n, r)),
      (e.unwrap = () => e._zod.def.innerType),
      (e.removeCatch = e.unwrap))
  })
  function Qs(e, t) {
    return new Zs({ type: `catch`, innerType: e, catchValue: typeof t == `function` ? t : et(t) })
  }
  let $s = /*@__PURE__*/ k(`ZodPipe`, (e, t) => {
    ;(ni.init(e, t),
      W.init(e, t),
      (e._zod.processJSONSchema = (t, n, r) => wo(e, t, n, r)),
      (e.in = t.in),
      (e.out = t.out))
  })
  function ec(e, t) {
    return new $s({ type: `pipe`, in: e, out: t })
  }
  let tc = /*@__PURE__*/ k(`ZodPreprocess`, (e, t) => {
      ;($s.init(e, t), ii.init(e, t))
    }),
    nc = /*@__PURE__*/ k(`ZodReadonly`, (e, t) => {
      ;(ai.init(e, t),
        W.init(e, t),
        (e._zod.processJSONSchema = (t, n, r) => To(e, t, n, r)),
        (e.unwrap = () => e._zod.def.innerType))
    })
  function rc(e) {
    return new nc({ type: `readonly`, innerType: e })
  }
  let ic = /*@__PURE__*/ k(`ZodCustom`, (e, t) => {
    ;(si.init(e, t), W.init(e, t), (e._zod.processJSONSchema = (t, n, r) => lo(e, t, n, r)))
  })
  function ac(e, t = {}) {
    return /* @__PURE__ */ ka(ic, e, t)
  }
  function oc(e, t) {
    return /* @__PURE__ */ Aa(e, t)
  }
  function sc(e, t) {
    return new tc({ type: `pipe`, in: Rs(e), out: t })
  }
  function cc(e) {
    return /* @__PURE__ */ ia(hs, e)
  }
  let lc = [
      { suffix: `create`, title: `创建角色`, icon: `add` },
      { suffix: `update`, title: `修改角色`, icon: `edit` },
      { suffix: `delete`, title: `删除角色`, icon: `delete` },
      { suffix: `permissions`, title: `设置角色权限`, icon: `permissions` },
    ],
    uc = [
      { suffix: `add`, title: `添加成员`, icon: `add` },
      { suffix: `status`, title: `启用或停用成员`, icon: `status` },
      { suffix: `remove`, title: `移除成员`, icon: `remove` },
      { suffix: `roles`, title: `分配成员角色`, icon: `roles` },
    ],
    dc = [
      {
        scopeType: `platform`,
        routeKey: `platform.home`,
        path: `/platform`,
        title: `平台工作台`,
        icon: `dashboard`,
        operations: [],
      },
      {
        scopeType: `platform`,
        routeKey: `platform.companies`,
        path: `/platform/companies`,
        title: `企业管理`,
        icon: `companies`,
        operations: [
          { suffix: `create`, title: `开通企业`, adminOnly: !0 },
          { suffix: `status`, title: `启用或停用企业` },
          { suffix: `administrator`, title: `设置企业管理员`, adminOnly: !0 },
        ],
      },
      {
        scopeType: `platform`,
        routeKey: `platform.accounts`,
        path: `/platform/accounts`,
        title: `全局账号`,
        icon: `accounts`,
        operations: [
          { suffix: `status`, title: `启用或停用账号` },
          { suffix: `roles`, title: `分配平台角色` },
          { suffix: `reset-password`, title: `重置账号密码`, adminOnly: !0 },
        ],
      },
      {
        scopeType: `platform`,
        routeKey: `platform.roles`,
        path: `/platform/roles`,
        title: `平台角色`,
        icon: `roles`,
        operations: lc,
      },
      {
        scopeType: `platform`,
        routeKey: `platform.menus`,
        path: `/platform/menus`,
        title: `菜单管理`,
        icon: `menus`,
        operations: [
          { suffix: `create`, title: `新增菜单节点` },
          { suffix: `update`, title: `修改菜单节点` },
          { suffix: `delete`, title: `删除菜单节点` },
          { suffix: `cleanup`, title: `清理废弃权限`, adminOnly: !0 },
        ],
      },
      {
        scopeType: `platform`,
        routeKey: `platform.audit`,
        path: `/platform/audit`,
        title: `平台操作日志`,
        icon: `audit-log`,
        operations: [],
      },
      {
        scopeType: `company`,
        routeKey: `company.home`,
        path: `/companies/:companyId`,
        title: `企业工作台`,
        icon: `home`,
        operations: [],
      },
      {
        scopeType: `company`,
        routeKey: `company.profile`,
        path: `/companies/:companyId/profile`,
        title: `企业资料`,
        icon: `profile`,
        operations: [{ suffix: `update`, title: `修改企业资料` }],
      },
      {
        scopeType: `company`,
        routeKey: `company.members`,
        path: `/companies/:companyId/members`,
        title: `企业成员`,
        icon: `members`,
        operations: uc,
      },
      {
        scopeType: `company`,
        routeKey: `company.roles`,
        path: `/companies/:companyId/roles`,
        title: `企业角色`,
        icon: `roles`,
        operations: lc,
      },
      {
        scopeType: `company`,
        routeKey: `company.projects`,
        path: `/companies/:companyId/projects`,
        title: `项目管理`,
        icon: `projects`,
        operations: [
          { suffix: `create`, title: `创建项目`, adminOnly: !0 },
          { suffix: `status`, title: `启用或停用项目` },
          { suffix: `administrator`, title: `设置项目管理员`, adminOnly: !0 },
        ],
      },
      {
        scopeType: `company`,
        routeKey: `company.organization`,
        path: `/companies/:companyId/organization`,
        title: `企业组织`,
        icon: `organization`,
        operations: [
          { suffix: `create`, title: `创建组织单元` },
          { suffix: `update`, title: `修改组织单元` },
          { suffix: `move`, title: `移动组织单元` },
          { suffix: `assign`, title: `分配组织成员` },
        ],
      },
      {
        scopeType: `company`,
        routeKey: `company.positions`,
        path: `/companies/:companyId/positions`,
        title: `企业岗位`,
        icon: `positions`,
        operations: [
          { suffix: `create`, title: `创建岗位` },
          { suffix: `update`, title: `修改岗位` },
          { suffix: `assign`, title: `分配岗位成员` },
        ],
      },
      {
        scopeType: `company`,
        routeKey: `company.organization.templates`,
        path: `/companies/:companyId/organization/templates`,
        title: `项目组织模板`,
        icon: `organization-template`,
        operations: [
          { suffix: `create`, title: `创建组织模板` },
          { suffix: `update`, title: `修改组织模板` },
        ],
      },
      {
        scopeType: `company`,
        routeKey: `company.audit`,
        path: `/companies/:companyId/audit`,
        title: `企业操作日志`,
        icon: `audit-log`,
        operations: [],
      },
      {
        scopeType: `project`,
        routeKey: `project.home`,
        path: `/companies/:companyId/projects/:projectId`,
        title: `项目工作台`,
        icon: `home`,
        operations: [],
      },
      {
        scopeType: `project`,
        routeKey: `project.profile`,
        path: `/companies/:companyId/projects/:projectId/profile`,
        title: `项目资料`,
        icon: `profile`,
        operations: [{ suffix: `update`, title: `修改项目资料` }],
      },
      {
        scopeType: `project`,
        routeKey: `project.members`,
        path: `/companies/:companyId/projects/:projectId/members`,
        title: `项目成员`,
        icon: `members`,
        operations: uc,
      },
      {
        scopeType: `project`,
        routeKey: `project.roles`,
        path: `/companies/:companyId/projects/:projectId/roles`,
        title: `项目角色`,
        icon: `roles`,
        operations: lc,
      },
      {
        scopeType: `project`,
        routeKey: `project.organization`,
        path: `/companies/:companyId/projects/:projectId/organization`,
        title: `项目组织`,
        icon: `organization`,
        operations: [
          { suffix: `create`, title: `创建组织单元` },
          { suffix: `update`, title: `修改组织单元` },
          { suffix: `move`, title: `移动组织单元` },
          { suffix: `assign`, title: `分配组织成员` },
        ],
      },
      {
        scopeType: `project`,
        routeKey: `project.positions`,
        path: `/companies/:companyId/projects/:projectId/positions`,
        title: `项目岗位`,
        icon: `positions`,
        operations: [
          { suffix: `create`, title: `创建岗位` },
          { suffix: `update`, title: `修改岗位` },
          { suffix: `assign`, title: `分配岗位成员` },
        ],
      },
      {
        scopeType: `project`,
        routeKey: `project.audit`,
        path: `/companies/:companyId/projects/:projectId/audit`,
        title: `项目操作日志`,
        icon: `audit-log`,
        operations: [],
      },
    ]
  ;(dc.map((e) => ({
    scopeType: e.scopeType,
    routeKey: e.routeKey,
    path: e.path,
    title: e.title,
    permissionKey: `${e.routeKey}.read`,
    icon: e.icon,
    operationKeys: e.operations.map((t) => `${e.routeKey}.${t.suffix}`),
  })),
    dc.flatMap((e) => [
      {
        key: `${e.routeKey}.read`,
        scopeType: e.scopeType,
        kind: `page`,
        title: e.title,
        routeKey: e.routeKey,
        pagePermissionKey: null,
        adminOnly: !1,
        deprecated: !1,
      },
      ...e.operations.map((t) => ({
        key: `${e.routeKey}.${t.suffix}`,
        scopeType: e.scopeType,
        kind: `operation`,
        title: t.title,
        routeKey: e.routeKey,
        pagePermissionKey: `${e.routeKey}.read`,
        adminOnly: t.adminOnly ?? !1,
        deprecated: !1,
      })),
    ]))
  async function fc({ file: e, signal: t, onProgress: n, chunkSize: r = 4194304 }) {
    if ((t?.throwIfAborted(), !Number.isSafeInteger(r) || r < 1 || r > 16777216))
      throw RangeError(`摘要读取块大小必须为 1 字节至 16 MiB 的整数`)
    let i = e.size
    if (!Number.isSafeInteger(i) || i < 0) throw RangeError(`文件大小必须为非负安全整数`)
    let a = await ie()
    ;(t?.throwIfAborted(), a.init())
    let o = 0,
      s = performance.now()
    for (n?.({ processedBytes: o, totalBytes: i }); o < i;) {
      t?.throwIfAborted()
      let c = Math.min(o + r, i),
        l = new Uint8Array(await e.slice(o, c).arrayBuffer())
      if ((t?.throwIfAborted(), l.byteLength !== c - o)) throw Error(`文件读取长度与预期不一致`)
      ;(a.update(l), (o = c))
      let u = performance.now()
      ;(o === i || u - s >= 100) && (n?.({ processedBytes: o, totalBytes: i }), (s = u))
    }
    return (t?.throwIfAborted(), a.digest(`hex`))
  }
  let pc = /^[A-Za-z0-9_-]+$/,
    Y = Qo(),
    mc = Ps([`active`, `disabled`]),
    X = G().trim().min(2).max(100),
    hc = G()
      .trim()
      .min(2)
      .max(32)
      .regex(pc)
      .transform((e) => e.toLowerCase()),
    gc = G().trim().max(500),
    _c = gs().int().min(0).max(999999999),
    Z = gs().int().positive(),
    vc = {
      page: cc().int().positive().default(1),
      pageSize: cc().int().min(1).max(100).default(20),
      query: G().trim().max(100).optional(),
    },
    yc = sc((e) => e === `true` || (e !== `false` && e), bs()),
    bc = q(Y)
      .min(1)
      .max(100)
      .refine((e) => new Set(e).size === e.length),
    xc = sc(
      (e) =>
        typeof e == `string`
          ? e.split(`,`).map((e) => e.trim())
          : Array.isArray(e)
            ? e.flatMap((e) => (typeof e == `string` ? e.split(`,`).map((e) => e.trim()) : [e]))
            : e,
      bc,
    ),
    Sc = q(Y).refine((e) => new Set(e).size === e.length),
    Q = { name: X, code: hc, description: gc.optional() }
  J({ ...Q, administratorUserId: Y })
  let Cc = J({ mode: Is(`blank`) }),
    wc = J({ mode: Is(`template`), templateId: Y, templateVersion: Z })
  ;(J({ ...Q, administratorUserId: Y, organizationInitialization: As(`mode`, [Cc, wc]) }),
    J({ administratorUserId: Y, replaceUserId: Y.optional() }),
    J({
      expectedVersion: Z,
      name: X.optional(),
      code: hc.optional(),
      description: gc.optional(),
    }).refine((e) => Object.keys(e).some((e) => e !== `expectedVersion`)),
    J({ parentId: Y.optional() }),
    J({ ...Q, parentId: Y.nullable().optional(), sort: _c.optional() }),
    J({
      expectedVersion: Z,
      name: X.optional(),
      code: hc.optional(),
      description: gc.optional(),
      sort: _c.optional(),
    }).refine((e) => Object.keys(e).some((e) => e !== `expectedVersion`)),
    J({ expectedVersion: Z, parentId: Y.nullable(), sort: _c.optional() }),
    J({ expectedVersion: Z, status: mc }))
  let Tc = Ps([`member`, `leader`, `deputy`])
  ;(J({
    relations: q(J({ organizationUnitId: Y, duty: Tc })).refine(
      (e) => new Set(e.map(({ organizationUnitId: e }) => e)).size === e.length,
    ),
  }),
    J({
      members: q(J({ userId: Y, duty: Tc })).refine(
        (e) => new Set(e.map(({ userId: e }) => e)).size === e.length,
      ),
    }),
    J({ ...vc, status: mc.optional() }),
    J(Q),
    J({
      expectedVersion: Z,
      name: X.optional(),
      code: hc.optional(),
      description: gc.optional(),
    }).refine((e) => Object.keys(e).some((e) => e !== `expectedVersion`)),
    J({ positionIds: Sc }),
    J({ userIds: Sc }))
  let Ec = J({
      clientKey: G().trim().min(1).max(100),
      parentClientKey: G().trim().min(1).max(100).nullable(),
      ...Q,
      sort: _c,
    }),
    Dc = J({ ...Q, status: mc }),
    Oc = { name: X, description: gc.optional(), units: q(Ec), positions: q(Dc) }
  ;(J({ ...vc, status: mc.optional() }),
    J({ ...Oc, isDefault: bs().optional() }),
    J({ expectedVersion: Z, ...Oc, isDefault: bs() }),
    J({ expectedVersion: Z, status: mc.optional(), isDefault: bs().optional() }).refine(
      ({ status: e, isDefault: t }) => e !== void 0 || t !== void 0,
    ))
  let kc = Ps([`createCompanyAdministrator`, `setCompanyAdministrator`]),
    Ac = Ps([
      `browseOrganization`,
      `assignPositionMembers`,
      `createProjectAdministrator`,
      `setProjectAdministrator`,
      `addProjectMember`,
    ])
  ;(J({ ...vc, purpose: kc }),
    J({ userIds: bc, purpose: kc }),
    J({
      ...vc,
      purpose: Ac.optional().default(`browseOrganization`),
      organizationUnitIds: xc.optional(),
      positionIds: xc.optional(),
      roleIds: xc.optional(),
      projectIds: xc.optional(),
      unassigned: yc.optional(),
      includeDisabled: yc.optional().default(!0),
    }),
    J({ userIds: bc, purpose: Ac.optional().default(`browseOrganization`) }))
  let $ = globalThis
  async function jc({ file: e, chunkSize: t }) {
    try {
      let n = await fc({
        file: e,
        chunkSize: t,
        onProgress: (e) => $.postMessage({ type: `progress`, progress: e }),
      })
      $.postMessage({ type: `complete`, sha256: n })
    } catch (e) {
      $.postMessage({
        type: `error`,
        name: e instanceof Error ? e.name : `Error`,
        message: e instanceof Error ? e.message : `文件摘要计算失败`,
      })
    }
  }
  $.onmessage = (e) => {
    ;(($.onmessage = null), jc(e.data))
  }
})()
