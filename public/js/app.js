/* La boda de Julia y Arturo — interacción de la web */
(function () {
  "use strict";

  var CFG = Object.assign({
    fechaBoda: "2027-04-10T13:00:00+02:00",
    iban: "",
    titular: "",
    musica: "musica/cancion.mp3",
    usarFotos: true,
    rsvpEndpoint: "api/rsvp",
    modoVistaPrevia: false
  }, window.BODA_CONFIG || {});

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function store(key, val) {
    try {
      if (val === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, val);
    } catch (e) { return null; }
  }

  /* ───────── música ───────── */
  var audio = $("#music");
  var musicBtn = $("#musicBtn");
  var musicOk = !!CFG.musica;
  var musicWanted = false;
  if (musicOk) {
    audio.src = CFG.musica;
    audio.addEventListener("error", function () { musicOk = false; musicBtn.hidden = true; });
  }
  function fadeTo(target, ms) {
    var start = audio.volume, t0 = performance.now();
    function step(now) {
      var k = Math.min(1, (now - t0) / ms);
      try { audio.volume = start + (target - start) * k; } catch (e) {}
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function setMusicUI(playing) {
    musicBtn.classList.toggle("is-playing", playing);
    musicBtn.setAttribute("aria-label", playing ? "Pausar la música" : "Poner la música");
    musicBtn.setAttribute("aria-pressed", playing ? "true" : "false");
  }
  function startMusic() {
    if (!musicOk) return;
    musicWanted = true;
    try { audio.volume = 0; } catch (e) {}
    var p = audio.play();
    if (p && p.then) {
      p.then(function () { musicBtn.hidden = false; setMusicUI(true); fadeTo(0.75, 2500); })
       .catch(function (err) {
         // blocked by the browser (not a missing file): offer the button so they can start it
         if (musicOk && err && err.name === "NotAllowedError") { musicBtn.hidden = false; setMusicUI(false); }
       });
    }
  }
  musicBtn.addEventListener("click", function () {
    if (audio.paused) {
      musicWanted = true;
      audio.play().then(function () { setMusicUI(true); fadeTo(0.75, 800); }).catch(function () {});
    } else {
      musicWanted = false;
      audio.pause();
      setMusicUI(false);
    }
  });
  document.addEventListener("visibilitychange", function () {
    if (!musicOk) return;
    if (document.hidden && !audio.paused) { audio.pause(); }
    else if (!document.hidden && musicWanted && audio.paused && !document.body.classList.contains("is-intro")) {
      audio.play().then(function () { setMusicUI(true); }).catch(function () { setMusicUI(false); });
    }
  });

  /* ───────── INTRO ───────── */
  var intro = $("#intro");
  var stage = $("#stage");
  var book = $("#book");
  var illu = $("#illu");
  var hit = $("#heartHit");
  var main = $("#main");
  var path = $("#ribbonPath");
  var GEO = window.BODA_GEO;
  var SRC_W = GEO.crop[0];
  var L = path.getTotalLength();
  var phase = "book"; // book → ready → opening → done

  // the two butterflies cut from the invitation (all numbers in the artwork's pixels)
  var BF = [
    { el: $("#bflyAnd"), box: GEO.boxAnd, anchor: GEO.anchorAnd, flap: GEO.flapAnd, head: GEO.headAnd, s: 0 },
    { el: $("#bflyCat"), box: GEO.boxCat, anchor: GEO.anchorCat, flap: GEO.flapCat, head: GEO.headCat, s: L }
  ];
  BF.forEach(function (b) {
    b.rot = 0; b.sx = 1; b.mir = false;
    var flap = b.el.querySelector(".flap");
    flap.style.setProperty("--phi", b.head + "deg");
    flap.style.transformOrigin = ((b.flap[0] - b.box[0]) / b.box[2] * 100).toFixed(2) + "% " +
      ((b.flap[1] - b.box[1]) / b.box[3] * 100).toFixed(2) + "%";
    b.el.classList.add("is-resting");
  });

  function unit() { return illu.clientWidth / SRC_W; }
  function pt(s) { var p = path.getPointAtLength(Math.max(0, Math.min(L, s))); return { x: p.x, y: p.y }; }
  function place(b, x, y) { // x, y: where the butterfly's anchor goes
    var u = unit();
    b.el.style.transform = "translate(" + ((x - b.anchor[0]) * u).toFixed(2) + "px," + ((y - b.anchor[1]) * u).toFixed(2) +
      "px) rotate(" + b.rot.toFixed(2) + "deg) scale(" + b.sx.toFixed(3) + ",1)";
  }
  function layout() {
    if (!illu.isConnected) return;
    var u = unit();
    BF.forEach(function (b) {
      var st = b.el.style;
      st.left = (b.box[0] * u).toFixed(2) + "px";
      st.top = (b.box[1] * u).toFixed(2) + "px";
      st.width = (b.box[2] * u).toFixed(2) + "px";
      st.height = (b.box[3] * u).toFixed(2) + "px";
      st.transformOrigin = ((b.anchor[0] - b.box[0]) * u).toFixed(2) + "px " + ((b.anchor[1] - b.box[1]) * u).toFixed(2) + "px";
      if (phase !== "opening") { var p = pt(b.s); place(b, p.x, p.y); }
    });
    var bu = $("#burst");
    if (!bu) return;
    bu.style.left = (GEO.heartC[0] * u) + "px";
    bu.style.top = (GEO.heartC[1] * u) + "px";
    bu.style.setProperty("--hs", Math.max(8, 30 * u).toFixed(1) + "px");
  }
  layout();
  var ro = null;
  if (window.ResizeObserver) { ro = new ResizeObserver(layout); ro.observe(illu); }
  else window.addEventListener("resize", layout);

  document.body.classList.add("is-locked", "is-intro");
  main.inert = true;
  main.setAttribute("aria-hidden", "true");

  function fontsReady() {
    var p = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return Promise.race([p, wait(1400)]);
  }
  function artReady() {
    var imgs = $$(".illu img");
    return Promise.race([Promise.all(imgs.map(function (img) {
      if (img.complete) return Promise.resolve();
      return new Promise(function (r) { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); });
    })), wait(3000)]);
  }

  var timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function toReady() {
    timers.forEach(clearTimeout);
    timers = [];
    book.classList.add("is-shown", "is-open", "is-turned");
    intro.classList.add("is-ready");
    phase = "ready";
  }
  function runBook() {
    if (reduceMotion) { toReady(); return; }
    book.classList.add("is-shown");
    later(function () { book.classList.add("is-open"); }, 1000);
    later(function () { book.classList.add("is-turned"); }, 3700);  // leaves the title page in view for ~2 s
    later(toReady, 4900);
  }
  Promise.all([fontsReady(), artReady()]).then(runBook);

  function skipBook() {
    book.style.transitionDuration = "0.45s";
    $$(".leaf, .cover", book).forEach(function (el) { el.style.transitionDuration = "0.45s"; });
    toReady();
  }
  // while the book is still opening, a tap anywhere skips ahead; after that only the heart opens it
  intro.addEventListener("click", function () { if (phase === "book") skipBook(); });
  hit.addEventListener("click", function (e) {
    e.stopPropagation();
    if (phase === "book") skipBook();
    else openInvitation();
  });
  hit.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (phase === "book") skipBook(); else openInvitation();
  });

  function burst() {
    var host = $("#burst");
    var u = unit();
    for (var i = 0; i < 10; i++) {
      var a = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
      var r = (120 + Math.random() * 90) * u;
      var h = document.createElement("i");
      h.style.setProperty("--dx", (Math.cos(a) * r).toFixed(1) + "px");
      h.style.setProperty("--dy", (Math.sin(a) * r - 30 * u).toFixed(1) + "px");
      h.style.setProperty("--s", (0.55 + Math.random() * 0.6).toFixed(2));
      h.style.setProperty("--r", ((Math.random() - 0.5) * 60).toFixed(0) + "deg");
      h.style.animationDelay = (Math.random() * 0.12).toFixed(2) + "s";
      host.appendChild(h);
    }
  }

  function openInvitation() {
    if (phase !== "ready") return;
    phase = "opening";
    startMusic();
    intro.classList.add("is-opening");
    illu.classList.add("is-opening");
    if (reduceMotion) { leave(); return; }
    burst();
    flight().then(function () { return wait(420); }).then(leave);
  }

  function smooth(x) { return x * x * (3 - 2 * x); }
  function norm(a) { while (a > 180) a -= 360; while (a < -180) a += 360; return a; }

  function flight() {
    return new Promise(function (resolve) {
      var T = 3300;
      var pA = Math.log(GEO.meet) / Math.log(0.5);
      var pC = Math.log(1 - GEO.meet) / Math.log(0.5);
      var t0 = null, last = null;
      BF.forEach(function (b) { b.el.classList.remove("is-resting"); b.el.classList.add("is-flying"); });
      var cfg = [
        { b: BF[0], prog: function (e) { return L * Math.pow(e, pA); }, dir: 1, ph: 0 },
        { b: BF[1], prog: function (e) { return L * (1 - Math.pow(e, pC)); }, dir: -1, ph: 2.2 }
      ];
      function frame(now) {
        if (t0 === null) { t0 = now; last = now; }
        var dt = Math.min(50, now - last); last = now;
        var u = Math.min(1, (now - t0) / T);
        var e = smooth(u);
        cfg.forEach(function (c) {
          var b = c.b;
          var s = c.prog(e);
          var p = pt(s);
          var a = pt(s - 4 * c.dir), q = pt(s + 4 * c.dir);
          var tx = q.x - a.x, ty = q.y - a.y, len = Math.hypot(tx, ty) || 1;
          tx /= len; ty /= len;
          // flutter across the line of flight and a gentle lift in the middle of the trip
          var env = Math.sin(Math.PI * u);
          var bob = Math.sin((now - t0) / 1000 * Math.PI * 2 * 1.7 + c.ph) * 16 * env;
          var lift = 24 * Math.sin(Math.PI * Math.min(1, u * 1.08)) * env;
          var x = p.x - ty * bob, y = p.y + tx * bob - lift;
          // face the way it flies, and lean a little into the curve
          var facesRight = Math.cos(b.head * Math.PI / 180) > 0;
          if (tx < -0.25) b.mir = facesRight;
          else if (tx > 0.25) b.mir = !facesRight;
          var headEff = b.mir ? 180 - b.head : b.head;
          var want = Math.max(-38, Math.min(38, 0.55 * norm(Math.atan2(ty, tx) * 180 / Math.PI - headEff)));
          b.rot += (want - b.rot) * (1 - Math.exp(-dt / 120));
          var target = b.mir ? -1 : 1, step = dt / 140;
          b.sx = b.sx < target ? Math.min(target, b.sx + step) : Math.max(target, b.sx - step);
          if (Math.abs(b.sx) < 0.06) b.sx = b.sx < 0 ? -0.06 : 0.06;
          b.s = s;
          place(b, x, y);
        });
        if (u < 1) requestAnimationFrame(frame);
        else settle().then(resolve);
      }
      requestAnimationFrame(frame);
    });
  }

  // each one ends up resting where the other was, in the other's pose (mirrored)
  function settle() {
    return new Promise(function (resolve) {
      var goals = [
        { b: BF[0], rot: norm(BF[1].head - (180 - BF[0].head)) },
        { b: BF[1], rot: norm(BF[0].head - (180 - BF[1].head)) }
      ];
      var from = goals.map(function (g) { return { rot: g.b.rot, sx: g.b.sx }; });
      var t0 = null;
      function frame(now) {
        if (t0 === null) t0 = now;
        var k = smooth(Math.min(1, (now - t0) / 480));
        goals.forEach(function (g, i) {
          g.b.rot = from[i].rot + (g.rot - from[i].rot) * k;
          var sx = from[i].sx + (-1 - from[i].sx) * k;
          g.b.sx = Math.abs(sx) < 0.06 ? -0.06 : sx;
          var p = pt(g.b.s);
          place(g.b, p.x, p.y);
        });
        if (k < 1) requestAnimationFrame(frame);
        else {
          BF.forEach(function (b) { b.el.classList.remove("is-flying"); b.el.classList.add("is-resting"); });
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  function leave() {
    var u = unit();
    var ir = illu.getBoundingClientRect();
    var sr = stage.getBoundingClientRect();
    var cx = ir.left + GEO.heartC[0] * u, cy = ir.top + GEO.heartC[1] * u;
    stage.style.setProperty("--zx", ((cx - sr.left) / sr.width * 100).toFixed(2) + "%");
    stage.style.setProperty("--zy", ((cy - sr.top) / sr.height * 100).toFixed(2) + "%");
    main.inert = false;
    main.removeAttribute("aria-hidden");
    window.scrollTo(0, 0);
    intro.classList.add("is-leaving");
    document.body.classList.add("is-revealing");
    document.body.classList.remove("is-intro");
    phase = "done";
    setTimeout(function () {
      if (ro) ro.disconnect();
      intro.remove();
      document.body.classList.remove("is-locked");
      var first = $(".hero h1");
      if (first) { first.setAttribute("tabindex", "-1"); first.focus({ preventScroll: true }); }
    }, reduceMotion ? 50 : 1200);
  }

  /* ───────── hero: hilo que se dibuja ───────── */
  $$(".thread-divider path").forEach(function (p) {
    try { p.style.setProperty("--len", Math.ceil(p.getTotalLength()) + 1); } catch (e) {}
  });

  /* ───────── cuenta atrás ───────── */
  var target = new Date(CFG.fechaBoda).getTime();
  var cd = $("#countdown");
  var cdDone = $("#countdownDone");
  var cells = {};
  $$("[data-u]", cd).forEach(function (el) { cells[el.getAttribute("data-u")] = el; });
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function tick() {
    var diff = target - Date.now();
    if (isNaN(target)) return;
    if (diff <= 0) {
      cd.hidden = true;
      cdDone.hidden = false;
      cdDone.textContent = diff > -24 * 3600 * 1000 ? "¡Hoy es el gran día!" : "Y fueron felices…";
      return;
    }
    var s = Math.floor(diff / 1000);
    cells.d.textContent = Math.floor(s / 86400);
    cells.h.textContent = pad(Math.floor(s / 3600) % 24);
    cells.m.textContent = pad(Math.floor(s / 60) % 60);
    cells.s.textContent = pad(s % 60);
  }
  tick();
  setInterval(tick, 1000);

  /* ───────── la precuela: diapositivas que pasan solas ───────── */
  var slides = $$(".slide");
  var caps = $$(".cap");
  var dotsBox = $("#storyDots");
  var bar = $("#storyProgress");
  var slidesBox = $("#slides");
  var cur = 0, timer = null, anim = null, visible = false, DUR = 5600;

  slides.forEach(function (fig, i) {
    var cols = (fig.getAttribute("data-c") || "").split(",");
    var yr = fig.getAttribute("data-yr"), pl = fig.getAttribute("data-pl");
    function placeholder() {
      fig.innerHTML = "";
      var ph = document.createElement("div");
      ph.className = "ph";
      ph.style.setProperty("--c1", cols[0] || "#e9d6b8");
      ph.style.setProperty("--c2", cols[1] || "#d8e0cc");
      ph.style.setProperty("--c3", cols[2] || "#f1e6cf");
      ph.innerHTML = '<span class="yr"></span><span class="pl"></span><span class="note">Aquí irá la foto</span>';
      ph.querySelector(".yr").textContent = yr;
      ph.querySelector(".pl").textContent = pl;
      fig.appendChild(ph);
    }
    if (CFG.usarFotos && fig.getAttribute("data-foto")) {
      var img = new Image();
      img.alt = (caps[i] ? caps[i].querySelector(".tx").textContent : "") + " (" + yr + ")";
      img.decoding = "async";
      if (i > 1) img.loading = "lazy";
      img.onerror = placeholder;
      img.src = fig.getAttribute("data-foto");
      fig.appendChild(img);
    } else {
      placeholder();
    }
    fig.setAttribute("aria-roledescription", "diapositiva");
    fig.setAttribute("aria-label", (i + 1) + " de " + slides.length);
    var d = document.createElement("button");
    d.type = "button";
    d.className = "dot";
    d.setAttribute("aria-label", "Ir a la diapositiva " + (i + 1) + " (" + yr + ")");
    d.addEventListener("click", function () { go(i, true); });
    dotsBox.appendChild(d);
  });
  var dots = $$(".dot", dotsBox);

  function show(i) {
    slides.forEach(function (s, k) { s.classList.toggle("is-on", k === i); s.setAttribute("aria-hidden", k === i ? "false" : "true"); });
    caps.forEach(function (c, k) { c.classList.toggle("is-on", k === i); });
    dots.forEach(function (d, k) { d.setAttribute("aria-current", k === i ? "true" : "false"); });
  }
  function runBar() {
    if (anim) anim.cancel();
    if (!bar.animate || reduceMotion) return;
    anim = bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: DUR, easing: "linear", fill: "forwards" });
  }
  function schedule() {
    clearTimeout(timer);
    if (!visible || document.hidden) { if (anim) anim.pause(); return; }
    runBar();
    timer = setTimeout(function () { go(cur + 1, false); }, DUR);
  }
  function go(i, byUser) {
    cur = (i + slides.length) % slides.length;
    if (byUser) $(".caption").setAttribute("aria-live", "polite");
    show(cur);
    schedule();
  }
  $(".caption").setAttribute("aria-live", "off");
  show(0);
  $("#storyPrev").addEventListener("click", function () { go(cur - 1, true); });
  $("#storyNext").addEventListener("click", function () { go(cur + 1, true); });
  // swipe
  var sx0 = null, sy0 = null;
  slidesBox.addEventListener("pointerdown", function (e) { sx0 = e.clientX; sy0 = e.clientY; });
  slidesBox.addEventListener("pointerup", function (e) {
    if (sx0 === null) return;
    var dx = e.clientX - sx0, dy = e.clientY - sy0;
    sx0 = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1), true);
  });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      schedule();
    }, { threshold: 0.35 }).observe(slidesBox);
  } else { visible = true; schedule(); }
  document.addEventListener("visibilitychange", schedule);

  /* ───────── el detalle: número de cuenta ───────── */
  (function () {
    var iban = (CFG.iban || "").replace(/\s+/g, "").toUpperCase();
    if (!iban) return;
    var pretty = iban.replace(/(.{4})/g, "$1 ").trim();
    $("#accountSoon").hidden = true;
    var ibanEl = $("#iban");
    ibanEl.textContent = pretty;
    ibanEl.hidden = false;
    if (CFG.titular) { var h = $("#holder"); h.textContent = "Titulares: " + CFG.titular; h.hidden = false; }
    var btn = $("#copyBtn"), lbl = $("#copyLabel");
    btn.hidden = false;
    $("#copyHint").hidden = false;
    function done() {
      btn.classList.add("is-done");
      lbl.textContent = "¡Copiado!";
      setTimeout(function () { btn.classList.remove("is-done"); lbl.textContent = "Copiar"; }, 2200);
    }
    function selectIt() {
      var r = document.createRange();
      r.selectNodeContents(ibanEl);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    function copy() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(iban).then(done, function () {
          selectIt();
          try { if (document.execCommand("copy")) done(); else lbl.textContent = "Selecciónalo y cópialo"; } catch (e) { lbl.textContent = "Selecciónalo y cópialo"; }
        });
      } else {
        selectIt();
        try { if (document.execCommand("copy")) done(); } catch (e) {}
      }
    }
    btn.addEventListener("click", copy);
    ibanEl.addEventListener("click", copy);
    ibanEl.style.cursor = "pointer";
  })();

  /* ───────── formulario de asistencia ───────── */
  var dlg = $("#rsvp");
  var form = $("#rsvpForm");
  var box = $("#personas");
  var tpl = $("#tpl-persona");
  var msg = $("#formMsg");
  var sendBtn = $("#sendBtn");
  var thanks = $("#thanks");
  var seq = 0;

  function renumber() {
    var list = $$(".persona", box);
    list.forEach(function (fs, i) {
      $(".num", fs).textContent = i + 1;
      $(".rm-btn", fs).hidden = list.length < 2;
      $(".persona-top", fs).hidden = list.length < 2;
    });
  }
  function addPersona(focus) {
    seq++;
    var node = tpl.content.firstElementChild.cloneNode(true);
    $$("[data-name]", node).forEach(function (inp) {
      var id = "p" + seq + "-" + inp.getAttribute("data-name");
      inp.id = id;
      inp.name = id;
      var lab = $('[data-for="' + inp.getAttribute("data-name") + '"]', node);
      if (lab) lab.setAttribute("for", id);
    });
    $$("[data-group]", node).forEach(function (g) {
      var name = "p" + seq + "-" + g.getAttribute("data-group");
      var q = $('[data-q="' + g.getAttribute("data-group") + '"]', node);
      if (q) { q.id = name + "-q"; g.setAttribute("aria-labelledby", q.id); }
      $$("input", g).forEach(function (r) { r.name = name; });
    });
    $$('[data-group="asiste"] input', node).forEach(function (r) {
      r.addEventListener("change", function () { node.setAttribute("data-coming", r.value); });
    });
    // once they start fixing a card, drop its old error message
    var clearErr = function () {
      var err = $(".err", node);
      if (!err.hidden) { err.hidden = true; err.textContent = ""; }
      $$("[aria-invalid]", node).forEach(function (i) { i.removeAttribute("aria-invalid"); });
      if (!$(".persona .err:not([hidden])", box)) { msg.textContent = ""; msg.classList.remove("is-error"); }
    };
    node.addEventListener("input", clearErr);
    node.addEventListener("change", clearErr);
    $(".rm-btn", node).addEventListener("click", function () {
      node.remove();
      renumber();
      var f = $(".persona input", box);
      if (f) f.focus();
    });
    box.appendChild(node);
    renumber();
    if (focus) $("input", node).focus();
    return node;
  }
  function resetForm() {
    form.reset();
    box.innerHTML = "";
    msg.textContent = "";
    msg.classList.remove("is-error");
    addPersona(false);
    form.hidden = false;
    thanks.hidden = true;
  }
  $("#rsvpOpen").addEventListener("click", function () {
    if (!$(".persona", box)) resetForm();
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    var f = $(".persona input", box);
    if (f) setTimeout(function () { f.focus(); }, 60);
  });
  function closeDlg() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
  $("#rsvpClose").addEventListener("click", closeDlg);
  $("#thanksClose").addEventListener("click", function () { closeDlg(); resetForm(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) closeDlg(); });
  $("#addPersona").addEventListener("click", function () { addPersona(true); });

  function radioVal(fs, group) {
    var r = $('[data-group="' + group + '"] input:checked', fs);
    return r ? r.value : "";
  }
  function collect() {
    var out = [], firstBad = null;
    $$(".persona", box).forEach(function (fs) {
      var err = $(".err", fs);
      var p = {
        nombre: $('[data-name="nombre"]', fs).value.trim(),
        apellidos: $('[data-name="apellidos"]', fs).value.trim(),
        asiste: radioVal(fs, "asiste"),
        alimentacion: $('[data-name="alimentacion"]', fs).value.trim(),
        autobus: radioVal(fs, "autobus"),
        cancion: $('[data-name="cancion"]', fs).value.trim()
      };
      var problems = [], bad = null;
      if (!p.nombre) { problems.push("el nombre"); bad = bad || $('[data-name="nombre"]', fs); }
      if (!p.apellidos) { problems.push("los apellidos"); bad = bad || $('[data-name="apellidos"]', fs); }
      if (!p.asiste) { problems.push("si vendrás a la boda"); bad = bad || $('[data-group="asiste"] input', fs); }
      if (p.asiste === "si" && !p.autobus) { problems.push("si necesitas autobús"); bad = bad || $('[data-group="autobus"] input', fs); }
      if (p.asiste === "no") { p.alimentacion = ""; p.autobus = ""; p.cancion = ""; }
      $$("input[type=text]", fs).forEach(function (i) { i.removeAttribute("aria-invalid"); });
      if (problems.length) {
        err.hidden = false;
        err.textContent = "Falta indicar " + problems.join(", ").replace(/, ([^,]*)$/, " y $1") + ".";
        if (bad && bad.type === "text") bad.setAttribute("aria-invalid", "true");
        firstBad = firstBad || bad;
      } else {
        err.hidden = true;
        err.textContent = "";
      }
      out.push(p);
    });
    return { personas: out, firstBad: firstBad };
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    msg.textContent = "";
    msg.classList.remove("is-error");
    var c = collect();
    if (c.firstBad) {
      msg.textContent = "Revisa los datos marcados, por favor.";
      msg.classList.add("is-error");
      c.firstBad.focus();
      return;
    }
    var payload = { personas: c.personas, web: $("#web").value };
    sendBtn.disabled = true;
    sendBtn.textContent = "Enviando…";
    var done = function () {
      var ul = $("#thanksList");
      ul.innerHTML = "";
      c.personas.forEach(function (p) {
        var li = document.createElement("li");
        li.textContent = p.nombre + " " + p.apellidos + (p.asiste === "si" ? " · viene" : " · no podrá venir");
        ul.appendChild(li);
      });
      $("#previewNote").hidden = !CFG.modoVistaPrevia;
      form.hidden = true;
      thanks.hidden = false;
      $("#thanksClose").focus();
      store("boda-confirmado", "1");
    };
    var always = function () { sendBtn.disabled = false; sendBtn.textContent = "Enviar confirmación"; };
    if (CFG.modoVistaPrevia) { setTimeout(function () { always(); done(); }, 600); return; }
    fetch(CFG.rsvpEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || ("HTTP " + r.status));
      });
    }).then(function () { always(); done(); })
      .catch(function (err) {
        always();
        msg.classList.add("is-error");
        msg.textContent = (err && err.message && err.message.indexOf("HTTP") !== 0 && err.message.length < 160)
          ? err.message
          : "No se ha podido enviar. Comprueba tu conexión e inténtalo de nuevo.";
      });
  });
})();
