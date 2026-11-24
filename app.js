(() => {
  "use strict";

  const CFG = window.CONFIG || {};
  const DEMO = !CFG.cloudName;
  const STORAGE_KEY = "cumple-clave";
  const MAX_SIDE = 2400; // lado máximo de la foto que se sube, en píxeles
  const REFRESH_MS = 30000;

  const $ = (id) => document.getElementById(id);
  const gate = $("gate");
  const app = $("app");
  const gallery = $("gallery");

  let tag = ""; // etiqueta y "upload preset" de Cloudinary, derivados de la clave
  let photos = []; // { id, thumb, full, download }
  let current = -1;
  let uploading = false;

  // ---------- Textos ----------
  document.querySelectorAll("[data-nombre]").forEach((el) => {
    el.textContent = CFG.nombre || "Helena";
  });
  document.title = "El cumple de " + (CFG.nombre || "Helena");
  $("subtitle").textContent = CFG.subtitulo || "";

  // ---------- Clave ----------
  const normalize = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function checkKey(raw) {
    const key = normalize(raw);
    if (!key) return false;
    if (DEMO) return true;
    return (await sha256(key)) === String(CFG.keyHash || "").toLowerCase();
  }

  function readStored() {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
  }
  function store(key) {
    try { localStorage.setItem(STORAGE_KEY, key); } catch { /* sin almacenamiento: se pide de nuevo */ }
  }

  async function init() {
    // El QR puede traer la clave después del "#", así los invitados no la tipean.
    const fromHash = decodeURIComponent(location.hash.slice(1));
    const candidates = [fromHash, readStored()].filter(Boolean);
    for (const c of candidates) {
      if (await checkKey(c)) return enter(c);
    }
    gate.hidden = false;
    $("key-input").focus();
  }

  function enter(rawKey) {
    const key = normalize(rawKey);
    store(key);
    tag = "cumple_" + key;
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    gate.hidden = true;
    app.hidden = false;
    $("demo-note").hidden = !DEMO;
    loadPhotos();
    if (CFG.mensajesUrl) {
      $("mensajes").hidden = false;
      loadMensajes();
      // Casi en tiempo real: busca mensajes nuevos cada 15 segundos y al volver a la pestaña.
      setInterval(() => {
        if (!document.hidden) loadMensajes();
      }, 15000);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) loadMensajes();
      });
    }
    setInterval(() => {
      if (!document.hidden && !uploading && $("lightbox").hidden) loadPhotos();
    }, REFRESH_MS);
  }

  $("gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = $("key-input").value;
    if (await checkKey(value)) {
      enter(value);
    } else {
      $("gate-error").hidden = false;
      $("key-input").select();
    }
  });

  // ---------- Cloudinary ----------
  const base = () => `https://res.cloudinary.com/${CFG.cloudName}/image`;

  function toPhoto(r) {
    const path = `v${r.version}/${r.public_id}.${r.format}`;
    return {
      id: r.public_id,
      thumb: `${base()}/upload/c_fill,g_auto,w_400,h_400,q_auto,f_auto/${path}`,
      full: `${base()}/upload/c_limit,w_1800,h_1800,q_auto,f_auto/${path}`,
      download: `${base()}/upload/fl_attachment/${path}`,
    };
  }

  async function fetchList() {
    // La "v" con la hora evita que la lista quede en caché y tarde en actualizarse.
    const urls = [
      `${base()}/list/v${Date.now()}/${tag}.json`,
      `${base()}/list/${tag}.json`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) return (await res.json()).resources || [];
        if (res.status === 404) return []; // todavía no hay fotos
      } catch { /* probar la siguiente */ }
    }
    throw new Error("No se pudo cargar la lista");
  }

  async function loadPhotos() {
    if (DEMO) return render();
    try {
      const resources = await fetchList();
      resources.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const fresh = resources.map(toPhoto);
      // Conservar las recién subidas que la lista todavía no trae.
      const known = new Set(fresh.map((p) => p.id));
      const pending = photos.filter((p) => p.justUploaded && !known.has(p.id));
      photos = [...pending, ...fresh];
      render();
    } catch {
      if (!photos.length) toast("No pudimos cargar las fotos. Revisá tu conexión.");
    }
  }

  // ---------- Galería ----------
  function render() {
    const have = new Map([...gallery.children].map((el) => [el.dataset.id, el]));
    const frag = document.createDocumentFragment();
    photos.forEach((p, i) => {
      let tile = have.get(p.id);
      if (!tile) {
        tile = document.createElement("button");
        tile.type = "button";
        tile.className = "tile";
        tile.dataset.id = p.id;
        tile.setAttribute("aria-label", "Ver foto");
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = "";
        img.addEventListener("load", () => img.classList.add("loaded"));
        img.src = p.thumb;
        tile.appendChild(img);
      }
      tile.dataset.index = i;
      frag.appendChild(tile);
    });
    gallery.replaceChildren(frag);
    $("empty").hidden = photos.length > 0;
    $("count").textContent =
      photos.length === 0 ? "" : photos.length === 1 ? "1 foto" : `${photos.length} fotos`;
  }

  gallery.addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    if (tile) openLightbox(Number(tile.dataset.index));
  });

  // ---------- Subida ----------
  $("upload-btn").addEventListener("click", () => $("file-input").click());

  $("file-input").addEventListener("change", async (e) => {
    const files = [...e.target.files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    e.target.value = "";
    if (!files.length || uploading) return;

    uploading = true;
    $("upload-btn").disabled = true;
    $("progress").hidden = false;
    let ok = 0;

    for (let i = 0; i < files.length; i++) {
      $("progress-text").textContent =
        files.length === 1 ? "Subiendo foto…" : `Subiendo foto ${i + 1} de ${files.length}…`;
      const setBar = (fraction) => {
        $("progress-bar").style.width = `${((i + fraction) / files.length) * 100}%`;
      };
      setBar(0);
      try {
        const blob = await shrink(files[i]);
        const photo = DEMO ? demoPhoto(blob) : await upload(blob, setBar);
        photo.justUploaded = true;
        photos.unshift(photo);
        render();
        ok++;
      } catch (err) {
        console.error(err);
      }
      setBar(1);
    }

    uploading = false;
    $("upload-btn").disabled = false;
    $("progress").hidden = true;
    $("progress-bar").style.width = "0";

    const failed = files.length - ok;
    if (failed === 0) toast(ok === 1 ? "¡Foto subida! Gracias" : `¡${ok} fotos subidas! Gracias`);
    else if (ok === 0) toast("No se pudieron subir las fotos. Probá de nuevo.");
    else toast(`Se subieron ${ok} fotos; ${failed} fallaron. Probá de nuevo con esas.`);
  });

  // Achica la foto antes de subirla para que sea rápido con datos móviles.
  async function shrink(file) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
      return blob && blob.size < file.size ? blob : file;
    } catch {
      return file; // si el navegador no puede leerla, se sube tal cual
    }
  }

  function upload(blob, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", blob);
      form.append("upload_preset", tag);
      form.append("tags", tag);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${CFG.cloudName}/image/upload`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(toPhoto(JSON.parse(xhr.responseText)));
        else reject(new Error(`Cloudinary respondió ${xhr.status}: ${xhr.responseText}`));
      };
      xhr.onerror = () => reject(new Error("Error de red"));
      xhr.send(form);
    });
  }

  function demoPhoto(blob) {
    const url = URL.createObjectURL(blob);
    return { id: "demo-" + Date.now() + Math.random(), thumb: url, full: url, download: url };
  }

  // ---------- Visor ----------
  const lightbox = $("lightbox");

  function openLightbox(i) {
    current = i;
    showCurrent();
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = "";
    $("lb-img").removeAttribute("src");
  }
  function showCurrent() {
    const p = photos[current];
    if (!p) return closeLightbox();
    $("lb-img").src = p.full;
    $("lb-download").href = p.download;
    const many = photos.length > 1;
    $("lb-prev").hidden = !many;
    $("lb-next").hidden = !many;
  }
  function step(d) {
    if (photos.length < 2) return;
    current = (current + d + photos.length) % photos.length;
    showCurrent();
  }

  $("lb-close").addEventListener("click", closeLightbox);
  $("lb-prev").addEventListener("click", () => step(-1));
  $("lb-next").addEventListener("click", () => step(1));
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (lightbox.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });

  let touchX = null;
  lightbox.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lightbox.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  });

  // ---------- Mensajes de los invitados ----------
  // Vienen de la planilla de confirmaciones de la invitación. Se muestran en tarjetas
  // que se deslizan solas cada 6 segundos (salvo que la persona las esté tocando).
  const track = $("mensajes-track");
  const dots = $("mensajes-dots");
  let mensajesFirma = "";
  let autoTimer = null;
  let pausa = false;

  const escHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let mensajesActuales = [];
  let cargando = false;

  async function loadMensajes() {
    if (!CFG.mensajesUrl || cargando) return;
    cargando = true;
    try {
      const r = await fetch(CFG.mensajesUrl, { cache: "no-store" });
      const data = await r.json();
      if (!data || !data.ok) return;
      const lista = data.mensajes || [];
      const firma = JSON.stringify(lista);
      if (firma === mensajesFirma) return; // nada nuevo
      mensajesFirma = firma;
      renderMensajes(lista);
    } catch {
      /* sin conexión o planilla no disponible: la sección queda como estaba */
    } finally {
      cargando = false;
    }
  }

  function renderMensajes(lista) {
    // Los que no estaban antes entran con una animación suave.
    const antes = new Set(mensajesActuales.map((m) => m.nombre + "|" + m.mensaje));
    const hayPrevios = mensajesActuales.length > 0;
    mensajesActuales = lista;
    $("mensajes-vacio").hidden = lista.length > 0;
    track.hidden = lista.length === 0;
    track.innerHTML = lista
      .map((m) => {
        const nuevo = hayPrevios && !antes.has(m.nombre + "|" + m.mensaje) ? " nuevo" : "";
        return (
          `<figure class="msg${nuevo}"><blockquote>${escHtml(m.mensaje)}</blockquote>` +
          `<figcaption>${escHtml(m.nombre)}</figcaption></figure>`
        );
      })
      .join("");
    dots.innerHTML = lista.length > 1 ? lista.map(() => "<span></span>").join("") : "";
    track.scrollLeft = 0;
    marcarDot();
    clearInterval(autoTimer);
    if (lista.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      autoTimer = setInterval(avanzar, 6000);
    }
  }

  function indiceActual() {
    const w = track.clientWidth || 1;
    return Math.round(track.scrollLeft / w);
  }
  function marcarDot() {
    const i = indiceActual();
    [...dots.children].forEach((d, j) => d.classList.toggle("on", i === j));
  }
  function avanzar() {
    if (pausa || document.hidden || !$("lightbox").hidden) return;
    const total = track.children.length;
    const sig = (indiceActual() + 1) % total;
    track.scrollTo({ left: sig * track.clientWidth, behavior: "smooth" });
  }
  track.addEventListener("scroll", () => requestAnimationFrame(marcarDot), { passive: true });
  ["pointerdown", "focusin", "mouseenter"].forEach((ev) => track.addEventListener(ev, () => { pausa = true; }));
  ["pointerup", "focusout", "mouseleave"].forEach((ev) =>
    track.addEventListener(ev, () => { setTimeout(() => { pausa = false; }, 4000); })
  );

  // ---------- Dejar un mensaje ----------
  const NOMBRE_KEY = "cumple-nombre";
  const msgDialog = $("msg-dialog");
  const msgForm = $("msg-form");
  const msgTexto = $("msg-texto");

  $("msg-open").addEventListener("click", () => {
    try { $("msg-nombre").value ||= localStorage.getItem(NOMBRE_KEY) || ""; } catch { /* sin almacenamiento */ }
    $("msg-error").hidden = true;
    msgDialog.showModal();
    ($("msg-nombre").value ? msgTexto : $("msg-nombre")).focus();
  });
  $("msg-close").addEventListener("click", () => msgDialog.close());
  msgDialog.addEventListener("click", (e) => { if (e.target === msgDialog) msgDialog.close(); });
  msgTexto.addEventListener("input", () => { $("msg-count").textContent = msgTexto.value.length; });

  msgForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = $("msg-nombre").value.trim().replace(/\s+/g, " ");
    const mensaje = msgTexto.value.trim();
    const err = (t) => { $("msg-error").textContent = t; $("msg-error").hidden = false; };
    $("msg-error").hidden = true;
    if (nombre.length < 2) return err("Escribí tu nombre.");
    if (mensaje.length < 2) return err("Escribí tu mensaje.");

    const btn = $("msg-enviar");
    btn.disabled = true;
    btn.textContent = "Enviando…";
    try {
      const r = await fetch(CFG.mensajesUrl.split("?")[0], {
        method: "POST",
        // text/plain evita el "preflight" que Google no acepta
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ tipo: "mensaje", nombre, mensaje, web: $("msg-web").value }),
      });
      const data = await r.json();
      if (!data || !data.ok) throw new Error("rechazado");
      try { localStorage.setItem(NOMBRE_KEY, nombre); } catch { /* sin almacenamiento */ }
      msgDialog.close();
      msgTexto.value = "";
      $("msg-count").textContent = "0";
      // Se muestra al instante, sin esperar a la próxima consulta.
      mensajesFirma = "";
      renderMensajes([{ nombre, mensaje, fecha: new Date().toISOString() }, ...mensajesActuales]);
      $("mensajes").scrollIntoView({ behavior: "smooth", block: "center" });
      toast("¡Gracias! Tu mensaje ya está en la pared.");
      setTimeout(loadMensajes, 3000);
    } catch {
      err("No se pudo enviar. Revisá tu conexión y probá de nuevo.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Enviar mensaje";
    }
  });

  // ---------- Aviso ----------
  let toastTimer;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }

  init();
})();
