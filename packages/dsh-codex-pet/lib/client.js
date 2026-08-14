/* dsh-codex-pet —— 客户端半（M5：PetPlayer 序列帧播放器 + 交互浮层 + Agent 状态联动）
 * 打包格式：window.__ModuleLoader__.load({ id, factory })。
 * 动画约定：docs/asset-spec.md §2.3/§2.4（行=动画、逐帧 ms、非基础动画播完落回 Agent 状态动画）。
 * 遵循开发规范：slot 窄入口、ctx.effect 清理、主题令牌、组件内定时器随卸载清理。
 */
window.__ModuleLoader__.load({
  id: "dsh-codex-pet",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    let useState = react.useState;
    let useEffect = react.useEffect;
    let useRef = react.useRef;
    let useCallback = react.useCallback;
    let useMemo = react.useMemo;

    // ---- 常量：动画约定（asset-spec §2.3，缺省表） ----
    var DEFAULT_ANIMS = {
      idle:            { row: 0, count: 6, ms: [1680, 660, 660, 840, 840, 1920] },
      "running-right": { row: 1, count: 8, ms: 120, last: 220 },
      "running-left":  { row: 2, count: 8, ms: 120, last: 220 },
      waving:          { row: 3, count: 4, ms: 140, last: 280 },
      jumping:         { row: 4, count: 5, ms: 140, last: 280 },
      failed:          { row: 5, count: 8, ms: 140, last: 240 },
      waiting:         { row: 6, count: 6, ms: 150, last: 260 },
      running:         { row: 7, count: 6, ms: 120, last: 220 },
      review:          { row: 8, count: 6, ms: 150, last: 280 },
    };
    // 11 行样例特有可选扩展（codex 目录未定义）：行 9/10 目测为下坠/弹起
    var EXTRA_ANIMS = {
      "jump-down": { row: 9, count: 8, ms: 120, last: 220 },
      "jump-up":   { row: 10, count: 8, ms: 120, last: 220 },
    };
    var ACTION_ANIMS = ["waving", "jumping", "running-right", "running-left"];

    // ---- 图库变更事件桥：图库页操作后通知浮层刷新（启用即显示） ----
    var petListeners = [];
    function emitPetChanged() {
      for (var i = 0; i < petListeners.length; i++) { try { petListeners[i](); } catch (e) {} }
    }
    function onPetChanged(f) {
      petListeners.push(f);
      return function () {
        var i = petListeners.indexOf(f);
        if (i >= 0) petListeners.splice(i, 1);
      };
    }

    // 构建帧序列：[[frameIndex, ms], ...]（帧索引 = 行×列数 + 列）
    function buildFrames(anim, columns) {
      var list = [];
      for (var i = 0; i < anim.count; i++) {
        var ms;
        if (Array.isArray(anim.ms)) ms = anim.ms[i] != null ? anim.ms[i] : 600;
        else ms = (i === anim.count - 1 && anim.last) ? anim.last : anim.ms;
        list.push([anim.row * columns + i, ms]);
      }
      return list;
    }

    // ---- Agent 状态 → 动画映射（asset-spec §2.4）----
    function mapAgentState(s) {
      if (!s) return "idle";
      if (s === "failed") return "failed";
      if (s === "working") return "running";
      if (s === "waiting") return "waiting";
      if (s === "done") return "review";
      return "idle";
    }
    var AGENT_BASE = { idle: 1, running: 1 }; // 常驻 base 仅 idle/running；waiting/review/failed 均为状态跳变时的一次性脉冲动画
    function isAgentAnim(name) { return !!AGENT_BASE[name]; }

    // ---- PetPlayer：渲染当前帧切片 ----
    function PetPlayer(props) {
      var pet = props.pet;
      var sessions = props.sessions;
      var frame = pet && pet.frame ? pet.frame : null;
      var sheetUrl = "/pet-assets/" + pet.id + "/" + (pet.spritesheetPath || "spritesheet.webp");
      var columns = frame ? frame.columns : 8;
      var rows = frame ? frame.rows : 9;
      var cellW = frame ? Math.round(frame.width / frame.columns) : 192;
      var cellH = frame ? Math.round(frame.height / frame.rows) : 208;

      // 可用动画表：缺省表 + 行数足够时附加扩展
      var table = useMemo(function () {
        var t = {};
        for (var k in DEFAULT_ANIMS) t[k] = DEFAULT_ANIMS[k];
        if (rows >= 11) for (var k2 in EXTRA_ANIMS) t[k2] = EXTRA_ANIMS[k2];
        return t;
      }, [rows]);

      var _s = useState("idle");
      var anim = _s[0];
      var setAnim = _s[1];
      var _f = useState(0);
      var frameIdx = _f[0];
      var setFrameIdx = _f[1];
      var animRef = useRef("idle");
      animRef.current = anim;

      // ---- Agent 状态联动（S2 数据源：api.sessions.list + session/jobs 帧）----
      var _a = useState("idle");
      var agentState = _a[0];
      var setAgentState = _a[1];
      var agentAnim = useMemo(function () { return mapAgentState(agentState); }, [agentState]);
      var agentAnimRef = useRef(agentAnim);
      agentAnimRef.current = agentAnim;
      var agentStateRef = useRef(agentState);
      agentStateRef.current = agentState;
      var prevRunningRef = useRef({});  // sessionId -> running（检测"跑完"跳变 → 得意脉冲）
      var prevWaitRef = useRef({});      // sessionId -> pendingInteraction（检测"等待"跳变 → 等待脉冲）
      var prevFailedRef = useRef(false); // 失败脉冲去重：失败持续存在时不反复播 row 5
      var primedRef = useRef(false);     // 首读只打底，不触发脉冲

      useEffect(function () {
        // S2 数据源：订阅 sessions.list 快照 store。
        // 模型：base = 失败/工作/空闲（常驻动画）；等待(审批/提问)、得意(跑完) 为状态跳变时的一次性脉冲。
        var store = sessions && sessions.list;
        if (!store || typeof store.getSnapshot !== "function" || typeof store.subscribe !== "function") return;
        function read() {
          var snap;
          try { snap = store.getSnapshot(); } catch (e) { return; }
          if (!snap) return;
          var byId = snap.byId || {};
          var jobs = snap.jobsBySession || {};
          var ids = snap.ids || Object.keys(byId);
          var prevRun = prevRunningRef.current;
          var prevWait = prevWaitRef.current;
          var working = false, failedNow = false, justFinished = false, waitingOnset = false;
          for (var i = 0; i < ids.length; i++) {
            var s = byId[ids[i]];
            if (!s) continue;
            var sid = (s.id !== void 0 ? s.id : s.sessionId);
            var isRunning = !!s.running;
            if (prevRun[sid] === true && !isRunning) justFinished = true;
            prevRun[sid] = isRunning;
            if (isRunning) working = true;
            if (s.pendingInteraction) {
              if (prevWait[sid] === void 0) waitingOnset = true;  // 等待出现 → 播一次 row 6
              prevWait[sid] = s.pendingInteraction;
            } else {
              delete prevWait[sid];
            }
          }
          for (var k in jobs) {
            var jl = jobs[k];
            if (Array.isArray(jl) && jl.some(function (j) { return j && j.status === "failed"; })) { failedNow = true; break; }
          }
          var st;
          if (working) st = "working";
          else st = "idle";
          if (!primedRef.current) {
            primedRef.current = true;
            prevFailedRef.current = failedNow;
            setAgentState(st);
            return; // 首读只打底，不触发脉冲
          }
          var played = false;
          if (failedNow && !prevFailedRef.current) { setAnim("failed"); played = true; }  // row 5 一次 → 回 base（通常 idle）
          prevFailedRef.current = failedNow;
          if (!played && waitingOnset) { setAnim("waiting"); played = true; }            // row 6 一次 → 回 base（通常 row 7）
          if (!played && justFinished) { setAnim("review"); }                            // row 8 一次 → 回 base（通常 idle）
          setAgentState(st);
        }
        read();
        var off;
        try { off = store.subscribe(read); } catch (e) {}
        return function () { if (off) { try { off(); } catch (e) {} } };
      }, [sessions]);

      // 基础动画随 Agent 状态切换（不打断进行中的交互动画）
      useEffect(function () {
        if (isAgentAnim(animRef.current)) setAnim(agentAnim);
      }, [agentAnim]);

      // 动画切换时从第 0 帧开始
      useEffect(function () { setFrameIdx(0); }, [anim]);

      var frames = useMemo(function () {
        var spec = table[anim] || DEFAULT_ANIMS.idle;
        return buildFrames(spec, columns);
      }, [anim, table, columns]);

      // 逐帧定时推进（随卸载/帧变化清理）
      useEffect(function () {
        if (!frames.length) return;
        var idx = frameIdx % frames.length;
        var ms = frames[idx][1];
        var t = setTimeout(function () {
          if (frameIdx + 1 < frames.length) { setFrameIdx(frameIdx + 1); return; }
          // 常驻 base 循环；一次性动画（waving/jumping/等待/得意）播完回 base
          if (isAgentAnim(animRef.current)) { setFrameIdx(0); }
          else { setAnim(agentAnimRef.current); }
        }, ms);
        return function () { clearTimeout(t); };
      }, [frames, frameIdx]);

      var frameIndex = frames.length ? frames[frameIdx % frames.length][0] : 0;
      var col = frameIndex % columns;
      var row = Math.floor(frameIndex / columns);

      // ---- 随机动作（仅空闲且当前在 base 动画时触发，不打断脉冲/交互动画）----
      useEffect(function () {
        var iv = setInterval(function () {
          var st = agentStateRef.current;
          if (st !== "idle") return;
          if (!isAgentAnim(animRef.current)) return;
          var r = Math.random();
          if (r < 0.5) {
            var name = ACTION_ANIMS[Math.floor(Math.random() * ACTION_ANIMS.length)];
            if (table[name]) setAnim(name);
          }
        }, 15000 + Math.floor(Math.random() * 15000));
        return function () { clearInterval(iv); };
      }, [table]);

      // ---- 拖拽 ----
      var posRef = useRef({ x: null, y: null });
      var dragRef = useRef(null);
      var movedRef = useRef(false);
      var onPointerDown = useCallback(function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        var el = e.currentTarget;
        var r = el.getBoundingClientRect();
        dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY };
        movedRef.current = false;
        if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
        setAnim("waiting");
      }, []);
      var onPointerMove = useCallback(function (e) {
        var d = dragRef.current;
        if (!d) return;
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 6) movedRef.current = true;
        var vw = window.innerWidth, vh = window.innerHeight;
        var x = Math.min(Math.max(e.clientX - d.dx, 0), vw - cellW);
        var y = Math.min(Math.max(e.clientY - d.dy, 0), vh - cellH - 8);
        setPos({ x: x, y: y });
        try { window.localStorage && window.localStorage.setItem("dsh-pet:pos", JSON.stringify({ x: x, y: y })); } catch (e) {}
        setAnim(e.movementX < 0 ? "running-left" : "running-right");
      }, [cellW, cellH]);
      var onPointerUp = useCallback(function () {
        dragRef.current = null;
        setAnim("idle");
      }, []);

      var _p = useState(function () {
        try {
          var saved = window.localStorage && window.localStorage.getItem("dsh-pet:pos");
          if (saved) { var p = JSON.parse(saved); if (p && typeof p.x === "number") return p; }
        } catch (e) {}
        return { x: null, y: null };
      });
      var pos = _p[0];
      var setPos = _p[1];

      var isIdle = anim === "idle";
      var baseStyle = {
        position: "fixed", zIndex: 9999,
        left: pos.x != null ? pos.x + "px" : undefined,
        top: pos.y != null ? pos.y + "px" : undefined,
        right: pos.x == null ? 24 : undefined,
        bottom: pos.x == null ? 24 : undefined,
        width: cellW + "px", height: cellH + "px",
        pointerEvents: "auto", cursor: isIdle ? "grab" : "grabbing",
        touchAction: "none", userSelect: "none",
        backgroundImage: "url(" + sheetUrl + ")",
        backgroundSize: frame ? (frame.width + "px " + frame.height + "px") : "auto",
        backgroundPosition: (-col * cellW) + "px " + (-row * cellH) + "px",
        backgroundRepeat: "no-repeat",
      };

      return react.createElement("div", {
        style: baseStyle,
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onPointerCancel: onPointerUp,
        title: pet.displayName || pet.id,
        onClick: function () {
          if (movedRef.current) { movedRef.current = false; return; }
          setAnim("waving");
        },
      });
    }

    // ---- PetOverlay：拉取列表，渲染启用宠物或提示 ----
    function PetOverlay(props) {
      var sessions = props && props.sessions;
      var _s = useState("loading");
      var state = _s[0];
      var setState = _s[1];
      var _p = useState(null);
      var pet = _p[0];
      var setPet = _p[1];

      var load = useCallback(function () {
        return fetch("/api/pets", { signal: AbortSignal.timeout(8000) })
          .then(function (r) { return r.json(); })
          .then(function (body) {
            if (!body || !body.ok) return;
            var list = body.pets || [];
            var active = list.find(function (p) { return p.id === body.active; }) || null;
            setPet(active);
            setState(active ? "pet" : (list.length === 0 ? "empty" : "none"));
          })
          .catch(function () { setState("err"); });
      }, []);
      useEffect(function () {
        var cancelled = false;
        var hasLoaded = false;
        function doLoad() {
          if (cancelled) return;
          if (!hasLoaded) setState("loading");
          load().then(function () { hasLoaded = true; }).catch(function () { hasLoaded = true; });
        }
        doLoad();
        var off = onPetChanged(doLoad);
        return function () { cancelled = true; off(); };
      }, [load]);

      if (state === "pet" && pet) return react.createElement(PetPlayer, { pet: pet, sessions: sessions });
      if (state === "empty") {
        return react.createElement("div", {
          style: {
            position: "fixed", right: 16, bottom: 16, zIndex: 9999, pointerEvents: "auto",
            padding: "8px 12px", borderRadius: "12px", fontSize: "12px", lineHeight: "1.6",
            background: "var(--dsw-specific-menu, #ffffff)",
            color: "var(--dsw-alias-label-tertiary, #666)",
            border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1))",
            font: "12px/1.6 var(--dsw-font-sans, system-ui, sans-serif)",
          },
        }, "🐾 还没有宠物 · 到设置导入");
      }
      // state === "none"：宠物已停用，全局隐藏
      return null;
    }


    // ---- 图库管理页（settings.section）----
    var BTN = {
      padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, lineHeight: 1.4,
      border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.15))",
      background: "var(--dsw-specific-field, #ffffff)",
      color: "var(--dsw-alias-label-primary, #111111)",
    };
    var BTN_SMALL = {
      padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, lineHeight: 1.4,
      border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.15))",
      background: "var(--dsw-specific-field, #ffffff)",
      color: "var(--dsw-alias-label-primary, #111111)",
    };
    var BTN_DANGER = {
      padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, lineHeight: 1.4,
      border: "1px solid var(--dsw-alias-danger-border, rgba(220,38,38,0.35))",
      background: "transparent",
      color: "var(--dsw-alias-danger, #dc2626)",
    };
    var INPUT = {
      flex: 1, minWidth: 0, padding: "6px 10px", borderRadius: 8, fontSize: 12, lineHeight: 1.4,
      border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.15))",
      background: "var(--dsw-specific-field, #ffffff)",
      color: "var(--dsw-alias-label-primary, #111111)",
      outline: "none",
    };

    function PetLibraryPage(_props) {
      var _s = useState("loading");
      var state = _s[0];
      var setState = _s[1];
      var _l = useState([]);
      var list = _l[0];
      var setList = _l[1];
      var _a = useState(null);
      var active = _a[0];
      var setActiveId = _a[1];
      var _e = useState(null);
      var error = _e[0];
      var setError = _e[1];
      var _u = useState("");
      var url = _u[0];
      var setUrl = _u[1];
      var _b = useState("");
      var busy = _b[0];
      var setBusy = _b[1];
      var fileRef = useRef(null);

      var refresh = useCallback(function () {
        return fetch("/api/pets", { signal: AbortSignal.timeout(8000) })
          .then(function (r) { return r.json(); })
          .then(function (body) {
            if (!body || !body.ok) throw new Error("列表获取失败");
            setList(body.pets || []);
            setActiveId(body.active || null);
            setError(null);
            setState("ready");
          })
          .catch(function (e) { setError((e && e.message) || String(e)); setState("ready"); });
      }, []);
      useEffect(function () { refresh(); }, [refresh]);

      function act(method, path, body) {
        setBusy(path);
        var opt = { method: method, signal: AbortSignal.timeout(30000) };
        if (body !== undefined) {
          if (typeof body === "string") { opt.body = body; opt.headers = { "content-type": "application/json" }; }
          else { opt.body = body; }
        }
        return fetch(path, opt)
          .then(function (r) { return r.json(); })
          .then(function (b) { if (!b || !b.ok) throw new Error((b && b.error && b.error.message) || "操作失败"); })
          .then(function () { emitPetChanged(); return refresh(); })
          .catch(function (e) { setError((e && e.message) || String(e)); })
          .then(function () { setBusy(""); });
      }

      function onUpload(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        file.arrayBuffer().then(function (buf) { return act("POST", "/api/pets/upload", buf); });
      }
      function onImportUrl() {
        var u = url.trim();
        if (!u) return;
        act("POST", "/api/pets/from-url", JSON.stringify({ url: u }));
      }
      function onSetActive(id) { act("POST", "/api/pets/active", JSON.stringify({ id: id })); }
      function onRemove(id) {
        if (window.confirm("删除宠物「" + id + "」？")) act("POST", "/api/pets/remove", JSON.stringify({ id: id }));
      }

      function previewNode(p) {
        var sheet = "/pet-assets/" + p.id + "/" + (p.spritesheetPath || "spritesheet.webp");
        // 首帧单元 192×208，等比缩放进 56×56 预览框（完整显示整帧，而非裁剪左上角）
        var scale = 56 / 192;
        return react.createElement("div", {
          style: {
            width: 56, height: 56, flex: "none", borderRadius: 8, overflow: "hidden",
            border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1))",
            background: "var(--dsw-alias-fill-l2, rgba(0,0,0,0.03))",
          },
        }, react.createElement("div", {
          style: {
            width: 192, height: 208, transform: "scale(" + scale + ")", transformOrigin: "0 0",
            backgroundImage: "url(" + sheet + ")",
            backgroundSize: p.frame.width + "px " + p.frame.height + "px",
            backgroundPosition: "0px 0px",
            backgroundRepeat: "no-repeat",
          },
        }));
      }

      var rows = list.map(function (p) {
        return react.createElement("div", {
          key: p.id,
          style: {
            display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", marginBottom: 8,
            borderRadius: 12, background: "var(--dsw-alias-fill-l2, rgba(0,0,0,0.03))",
            border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))",
          },
        },
          previewNode(p),
          react.createElement("div", { style: { flex: 1, minWidth: 0 } },
            react.createElement("div", { style: { fontWeight: 600, fontSize: 13, color: "var(--dsw-alias-label-primary, #111)" } }, p.displayName),
            react.createElement("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary, #888)", marginTop: 2 } }, p.id),
            react.createElement("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary, #888)", marginTop: 2 } },
              p.frame.width + "×" + p.frame.height + " · " + p.frame.columns + "×" + p.frame.rows + " 网格 · " + Math.round(p.assetBytes / 1024) + " KB"),
          ),
          react.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center" } },
            p.id === active
              ? react.createElement("span", { style: { fontSize: 11, color: "var(--dsw-alias-success, #16a34a)", fontWeight: 600 } }, "● 启用中")
              : react.createElement("button", { onClick: function () { onSetActive(p.id); }, disabled: !!busy, style: BTN_SMALL }, "启用"),
            react.createElement("button", { onClick: function () { onRemove(p.id); }, disabled: !!busy, style: BTN_DANGER }, "删除")
          )
        );
      });

      return react.createElement("div", { style: { padding: "2px 0 8px" } },
        react.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12, alignItems: "center" } },
          react.createElement("button", { onClick: function () { if (fileRef.current) fileRef.current.click(); }, disabled: !!busy, style: BTN }, "上传 zip"),
          react.createElement("input", { type: "file", accept: ".zip", ref: fileRef, style: { display: "none" }, onChange: onUpload }),
          react.createElement("input", {
            type: "text", placeholder: "或输入 zip 下载 URL 后回车…", value: url,
            style: INPUT,
            onChange: function (e) { setUrl(e.target.value); },
            onKeyDown: function (e) { if (e.key === "Enter") onImportUrl(); },
          }),
          react.createElement("button", { onClick: onImportUrl, disabled: !!busy || !url.trim(), style: BTN }, "导入"),
          active
            ? react.createElement("button", {
                onClick: function () { act("POST", "/api/pets/active", JSON.stringify({ id: null })); },
                disabled: !!busy, style: BTN_DANGER,
              }, "停用宠物")
            : null
        ),
        error ? react.createElement("div", { style: { fontSize: 12, color: "var(--dsw-alias-danger, #dc2626)", marginBottom: 8 } }, String(error)) : null,
        state === "loading" && list.length === 0
          ? react.createElement("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #888)" } }, "加载中…")
          : list.length === 0
            ? react.createElement("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #888)" } }, "尚无宠物。上传 zip 或输入 URL 导入。")
            : rows
      );
    }

    var inject = ["slots", "sessions"];
    function apply(ctx) {
      var sessions = null;
      try { sessions = ctx.get("sessions"); } catch (e) {}
      ctx.effect(function () {
        return ctx.slots.inject("shell.overlay", function () {
          return ctx.slots.register(
            {
              name: "shell.overlay", id: "dsh-pet", order: 100, label: "Pet",
              inject: function () { return { sessions: sessions }; },
            },
            PetOverlay
          );
        });
      }, "dsh-pet: shell.overlay");
      ctx.effect(function () {
        return ctx.slots.inject("settings.section", function () {
          return ctx.slots.register(
            { name: "settings.section", id: "pet-library", order: 90, label: () => "宠物图库" },
            PetLibraryPage
          );
        });
      }, "dsh-pet: settings.section");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});