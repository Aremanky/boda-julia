/*
 * Servidor de la web de la boda de Julia y Arturo.
 * Sin dependencias: solo Node.js 18 o superior.
 *
 *   PORT=8080 ADMIN_PASSWORD=algo-largo node server.js
 *
 * - Sirve la web (carpeta public/).
 * - POST /api/rsvp         guarda las confirmaciones en data/confirmaciones.jsonl
 * - GET  /admin            panel con contraseña para ver las respuestas
 * - GET  /admin/confirmaciones.csv   descarga para Excel
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "confirmaciones.jsonl");
const ADMIN_USER = process.env.ADMIN_USER || "novios";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self'; connect-src 'self'; " +
    "frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
}

/* ───────── ficheros estáticos (con soporte de Range para el audio en iPhone) ───────── */
function serveStatic(req, res, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return send(res, 400, "Bad request"); }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) return send(res, 403, "Forbidden");
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, "No encontrado", { "Content-Type": "text/plain; charset=utf-8" });
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const longCache = /\.(webp|jpe?g|png|gif|avif|mp3|m4a|aac|ogg|woff2?|svg|ico)$/i.test(ext);
    const headers = {
      "Content-Type": type,
      "Cache-Control": longCache ? "public, max-age=604800" : "no-cache",
      "Accept-Ranges": "bytes",
      "Last-Modified": st.mtime.toUTCString(),
    };
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m) return send(res, 416, "", { "Content-Range": `bytes */${st.size}` });
      let start = m[1] === "" ? st.size - Number(m[2]) : Number(m[1]);
      let end = m[1] === "" || m[2] === "" ? st.size - 1 : Number(m[2]);
      if (isNaN(start) || isNaN(end) || start > end || start < 0 || end >= st.size) {
        return send(res, 416, "", { "Content-Range": `bytes */${st.size}` });
      }
      res.writeHead(206, { ...SECURITY_HEADERS, ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...SECURITY_HEADERS, ...headers, "Content-Length": st.size });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ───────── confirmaciones ───────── */
const hits = new Map(); // límite sencillo por IP: 12 envíos cada 10 minutos
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 12;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < 10 * 60 * 1000)) hits.delete(ip);
}, 60 * 1000).unref();

function clientIp(req) {
  return String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .split(",")[0].trim();
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("too_big")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const BUS = new Set(["", "no", "ida", "vuelta", "ida_vuelta"]);

async function handleRsvp(req, res) {
  if (rateLimited(clientIp(req))) return sendJson(res, 429, { ok: false, error: "Demasiados envíos seguidos. Espera unos minutos y vuelve a intentarlo." });
  let data;
  try { data = JSON.parse(await readBody(req, 32 * 1024)); }
  catch { return sendJson(res, 400, { ok: false, error: "No se han podido leer los datos." }); }
  if (data && data.web) return sendJson(res, 200, { ok: true }); // campo trampa para bots
  const personas = Array.isArray(data && data.personas) ? data.personas.slice(0, 15) : [];
  if (!personas.length) return sendJson(res, 400, { ok: false, error: "Añade al menos una persona." });
  const grupo = crypto.randomBytes(6).toString("hex");
  const fecha = new Date().toISOString();
  const lines = [];
  for (const p of personas) {
    const r = {
      fecha,
      grupo,
      nombre: clean(p.nombre, 80),
      apellidos: clean(p.apellidos, 100),
      asiste: p.asiste === "si" ? "si" : p.asiste === "no" ? "no" : "",
      alimentacion: clean(p.alimentacion, 300),
      autobus: BUS.has(p.autobus) ? p.autobus : "",
      cancion: clean(p.cancion, 150),
    };
    if (!r.nombre || !r.apellidos || !r.asiste) return sendJson(res, 400, { ok: false, error: "Falta el nombre, los apellidos o la respuesta de alguna persona." });
    if (r.asiste === "si" && !r.autobus) return sendJson(res, 400, { ok: false, error: "Indica si necesitas autobús." });
    if (r.asiste === "no") { r.alimentacion = ""; r.autobus = ""; r.cancion = ""; }
    lines.push(JSON.stringify(r));
  }
  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.appendFile(DATA_FILE, lines.join("\n") + "\n", "utf8");
  }
  catch (e) { console.error("No se pudo guardar:", e); return sendJson(res, 500, { ok: false, error: "No se ha podido guardar. Inténtalo de nuevo en un rato." }); }
  console.log(`[rsvp] ${fecha} ${lines.length} persona(s)`);
  sendJson(res, 200, { ok: true });
}

/* ───────── panel de los novios ───────── */
function authorized(req) {
  if (!ADMIN_PASSWORD) return false;
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const [u, ...rest] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
  const p = rest.join(":");
  const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  return eq(u, ADMIN_USER) && eq(p, ADMIN_PASSWORD);
}

function loadAll() {
  let txt = "";
  try { txt = fs.readFileSync(DATA_FILE, "utf8"); } catch { return []; }
  return txt.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function withLatest(rows) {
  // si alguien confirma dos veces, cuenta la última respuesta
  const latest = new Map();
  rows.forEach((r, i) => latest.set(norm(r.nombre + " " + r.apellidos), i));
  return rows.map((r, i) => ({ ...r, vigente: latest.get(norm(r.nombre + " " + r.apellidos)) === i }));
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BUS_TXT = { "": "—", no: "No", ida: "Solo ida", vuelta: "Solo vuelta", ida_vuelta: "Ida y vuelta" };
const fmtDate = (iso) => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function adminPage(rows) {
  const all = withLatest(rows);
  const cur = all.filter((r) => r.vigente);
  const si = cur.filter((r) => r.asiste === "si");
  const no = cur.filter((r) => r.asiste === "no");
  const ida = si.filter((r) => r.autobus === "ida" || r.autobus === "ida_vuelta").length;
  const vuelta = si.filter((r) => r.autobus === "vuelta" || r.autobus === "ida_vuelta").length;
  const dietas = si.filter((r) => r.alimentacion);
  const canciones = si.filter((r) => r.cancion);
  const tr = all.slice().reverse().map((r) => `<tr class="${r.vigente ? "" : "old"}">
      <td>${esc(fmtDate(r.fecha))}</td><td>${esc(r.nombre)} ${esc(r.apellidos)}${r.vigente ? "" : ' <span class="tag">respuesta anterior</span>'}</td>
      <td>${r.asiste === "si" ? "Sí" : "No"}</td><td>${esc(BUS_TXT[r.autobus] || "—")}</td>
      <td>${esc(r.alimentacion || "")}</td><td>${esc(r.cancion || "")}</td></tr>`).join("");
  const li = (list, f) => list.length ? list.map((r) => `<li><b>${esc(r.nombre)} ${esc(r.apellidos)}</b>: ${esc(f(r))}</li>`).join("") : "<li>Nadie por ahora.</li>";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confirmaciones · Julia y Arturo</title>
<style>
:root{--ink:#1d2234;--soft:#5b5f6e;--paper:#f6efe0;--card:#fffdf8;--russet:#7a3412;--line:#e2d6bd}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 Georgia,"Times New Roman",serif}
.w{max-width:1100px;margin:0 auto;padding:28px max(16px,env(safe-area-inset-left)) 60px max(16px,env(safe-area-inset-right))}
h1{font-weight:400;font-size:2rem;margin:0 0 4px}p.sub{margin:0 0 22px;color:var(--soft)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.stat b{display:block;font-size:2rem;font-weight:400;color:var(--russet);font-variant-numeric:tabular-nums}
.stat span{color:var(--soft);font-size:.92rem}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px;margin-bottom:24px}
.box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 18px}
.box h2{font-size:1.1rem;font-weight:400;margin:0 0 8px;color:var(--russet)}.box ul{margin:0;padding-left:18px}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
a.btn{display:inline-block;padding:9px 16px;border-radius:999px;background:var(--ink);color:#fff;text-decoration:none}
.tw{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;min-width:760px;font-size:.95rem}th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:400;color:var(--soft);font-size:.85rem;text-transform:uppercase;letter-spacing:.08em}
tr.old td{color:#9a9aa3}.tag{font-size:.75rem;border:1px solid #ccc;border-radius:999px;padding:1px 7px;margin-left:4px}
</style></head><body><div class="w">
<h1>Confirmaciones</h1><p class="sub">La boda de Julia y Arturo · 10 de abril de 2027. Si alguien confirma dos veces, se cuenta su última respuesta.</p>
<div class="stats">
<div class="stat"><b>${si.length}</b><span>vienen</span></div>
<div class="stat"><b>${no.length}</b><span>no pueden venir</span></div>
<div class="stat"><b>${ida}</b><span>plazas de bus a la ida</span></div>
<div class="stat"><b>${vuelta}</b><span>plazas de bus a la vuelta</span></div>
<div class="stat"><b>${dietas.length}</b><span>con consideraciones alimentarias</span></div>
</div>
<div class="cols">
<div class="box"><h2>Consideraciones alimentarias</h2><ul>${li(dietas, (r) => r.alimentacion)}</ul></div>
<div class="box"><h2>Canciones pedidas</h2><ul>${li(canciones, (r) => r.cancion)}</ul></div>
</div>
<div class="bar"><a class="btn" href="/admin/confirmaciones.csv">Descargar para Excel</a><span class="sub">${all.length} respuestas en total</span></div>
<div class="tw"><table><thead><tr><th>Fecha</th><th>Nombre</th><th>Viene</th><th>Autobús</th><th>Alimentación</th><th>Canción</th></tr></thead>
<tbody>${tr || '<tr><td colspan="6">Todavía no ha llegado ninguna confirmación.</td></tr>'}</tbody></table></div>
</div></body></html>`;
}

function csv(rows) {
  const all = withLatest(rows);
  const q = (v) => {
    let s = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmulas al abrir en Excel
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const head = ["Fecha", "Nombre", "Apellidos", "Viene", "Autobús", "Consideraciones alimentarias", "Canción", "Grupo", "Respuesta vigente"];
  const body = all.map((r) => [fmtDate(r.fecha), r.nombre, r.apellidos, r.asiste === "si" ? "Sí" : "No", BUS_TXT[r.autobus] || "", r.alimentacion, r.cancion, r.grupo, r.vigente ? "Sí" : "No"].map(q).join(";"));
  return "﻿" + [head.map(q).join(";"), ...body].join("\r\n") + "\r\n";
}

/* ───────── router ───────── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/api/rsvp") {
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Método no permitido" });
      return await handleRsvp(req, res);
    }
    if (p === "/admin" || p === "/admin/" || p === "/admin/confirmaciones.csv") {
      if (!ADMIN_PASSWORD) return send(res, 503, "Panel desactivado: arranca el servidor con la variable ADMIN_PASSWORD.", { "Content-Type": "text/plain; charset=utf-8" });
      if (!authorized(req)) return send(res, 401, "Hace falta usuario y contraseña.", { "WWW-Authenticate": 'Basic realm="Boda", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8" });
      const rows = loadAll();
      if (p.endsWith(".csv")) {
        return send(res, 200, csv(rows), { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="confirmaciones-boda.csv"', "Cache-Control": "no-store" });
      }
      return send(res, 200, adminPage(rows), { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Método no permitido");
    return serveStatic(req, res, p);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Error interno" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Web de la boda en http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  if (!ADMIN_PASSWORD) console.log("Aviso: sin ADMIN_PASSWORD el panel /admin está desactivado.");
});
