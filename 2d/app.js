/* Оболочка входа «Жизнь Гровера 2D». Код игры не хранится в репозитории — он загружается из приватного хранилища (game/2d/) после проверки списка. */
(function () {
  "use strict";

  const SUPABASE_URL = "https://miyaeplmsbrbgbflwqvq.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_7l0U-Dnwc3AdOTFnOz7ZtA_BGzbhu3I";
  const BUCKET = "game";
  const FILES = { html: "2d/index.html", css: "2d/style.css", js: "2d/game.js" };

  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce"
    }
  });

  let email = "";
  let booting = false;
  let resendAt = 0;

  const $ = (id) => document.getElementById(id);
  const screens = ["s-email", "s-code", "s-wait", "s-denied"];

  function show(id) {
    for (const s of screens) {
      const el = $(s);
      if (el) el.classList.toggle("on", s === id);
    }
  }

  function setStatus(id, text, kind) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("err", "ok");
    if (kind) el.classList.add(kind);
  }

  // Ссылка из письма ведёт на корневую страницу (она уже есть в Redirect URLs Supabase),
  // а корень по метке grower_go=2d сразу возвращает сюда. Сессия общая (тот же сайт).
  function redirectTo() {
    try { localStorage.setItem("grower_go", "2d|" + Date.now()); } catch (_) {}
    const u = new URL("../", window.location.href);
    return u.href;
  }

  function ruError(err) {
    const m = (err && (err.message || err.error_description || err.msg) || "") + "";
    const s = m.toLowerCase();
    if (/rate|too many|security/.test(s)) return "Слишком много попыток. Подождите минуту и попробуйте снова.";
    if (/invalid|otp|token|expired|code/.test(s) && /otp|token|code|expired|invalid/.test(s))
      return "Код неверный или устарел. Запросите письмо ещё раз.";
    if (/redirect|whitelist|allowed/.test(s)) return "Ссылка возврата не разрешена в настройках входа. Сообщите администратору.";
    if (/network|fetch|failed to fetch/.test(s)) return "Нет связи с сервером. Проверьте интернет и попробуйте снова.";
    if (/email/.test(s) && /invalid/.test(s)) return "Похоже, email указан неверно.";
    return m ? ("Не получилось: " + m) : "Не получилось. Попробуйте ещё раз.";
  }

  function getCode() {
    return Array.from(document.querySelectorAll("#codebox input"))
      .map((i) => i.value.replace(/\D/g, ""))
      .join("");
  }

  function setCode(str) {
    const digits = String(str || "").replace(/\D/g, "").slice(0, 6).split("");
    const inputs = document.querySelectorAll("#codebox input");
    inputs.forEach((inp, i) => { inp.value = digits[i] || ""; });
    const next = digits.length < 6 ? inputs[digits.length] : inputs[5];
    if (next) next.focus();
  }

  function setupCodeInputs() {
    const inputs = Array.from(document.querySelectorAll("#codebox input"));
    inputs.forEach((inp, idx) => {
      inp.addEventListener("input", (e) => {
        const v = e.target.value.replace(/\D/g, "");
        if (v.length > 1) {
          setCode(v);
          if (getCode().length === 6) $("f-code").requestSubmit();
          return;
        }
        e.target.value = v.slice(-1);
        if (e.target.value && inputs[idx + 1]) inputs[idx + 1].focus();
        if (getCode().length === 6) $("f-code").requestSubmit();
      });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !inp.value && inputs[idx - 1]) {
          inputs[idx - 1].focus();
          inputs[idx - 1].value = "";
          e.preventDefault();
        }
        if (e.key === "ArrowLeft" && inputs[idx - 1]) inputs[idx - 1].focus();
        if (e.key === "ArrowRight" && inputs[idx + 1]) inputs[idx + 1].focus();
      });
      inp.addEventListener("paste", (e) => {
        e.preventDefault();
        const t = (e.clipboardData || window.clipboardData).getData("text");
        setCode(t);
        if (getCode().length === 6) $("f-code").requestSubmit();
      });
    });
  }

  // launchGameFromParts — в boot.js

  async function downloadGameFiles() {
    const out = {};
    for (const [key, path] of Object.entries(FILES)) {
      const { data, error } = await client.storage.from(BUCKET).download(path);
      if (error || !data) {
        const msg = (error && error.message) || ("нет файла " + path);
        const err = new Error(msg);
        err.code = error && error.statusCode;
        throw err;
      }
      out[key] = await data.text();
    }
    if (!out.html || !out.css || !out.js) throw new Error("Неполный комплект файлов игры.");
    return out;
  }

  async function checkAllowlist() {
    const { data, error } = await client.from("allowlist").select("email,role").maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function afterLogin() {
    try { localStorage.removeItem("grower_go"); } catch (_) {}
    if (booting) return;
    booting = true;
    show("s-wait");
    $("wait-title").textContent = "Проверяем доступ…";
    $("wait-lead").textContent = "Сверяем адрес со списком допущенных.";
    try {
      const row = await checkAllowlist();
      if (!row) {
        booting = false;
        try { await client.auth.signOut(); } catch (_) {}
        show("s-denied");
        return;
      }
      $("wait-title").textContent = "Загружаем игру…";
      $("wait-lead").textContent = "Файлы идут из закрытого хранилища.";
      const parts = await downloadGameFiles();
      launchGameFromParts(parts);
    } catch (err) {
      booting = false;
      const msg = (err && err.message) || "";
      show("s-wait");
      $("wait-title").textContent = "Не удалось загрузить игру";
      $("wait-lead").textContent = /not found|404|object/i.test(msg)
        ? "Файлы игры ещё не загружены в хранилище. Попробуйте позже или сообщите администратору."
        : ruError(err);
      const back = document.createElement("div");
      back.className = "row";
      back.innerHTML = '<button class="btn alt" type="button" id="b-retry">Попробовать снова</button>';
      const lead = $("wait-lead");
      if (lead && !document.getElementById("b-retry")) {
        lead.after(back);
        $("b-retry").onclick = async () => {
          back.remove();
          const { data: { session } } = await client.auth.getSession();
          if (session) afterLogin();
          else show("s-email");
        };
      }
    }
  }

  async function sendOtp(addr) {
    const { error } = await client.auth.signInWithOtp({
      email: addr,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectTo()
      }
    });
    if (error) throw error;
    resendAt = Date.now() + 40000;
  }

  $("f-email").addEventListener("submit", async (e) => {
    e.preventDefault();
    const addr = ($("email").value || "").trim().toLowerCase();
    if (!addr || !addr.includes("@")) {
      setStatus("st-email", "Укажите настоящий email.", "err");
      return;
    }
    $("b-send").disabled = true;
    setStatus("st-email", "Отправляем письмо…");
    try {
      await sendOtp(addr);
      email = addr;
      $("code-lead").textContent = "Письмо отправлено на " + addr + ". Проверьте входящие и папку «Спам». Введите 6 цифр или откройте ссылку из письма.";
      setStatus("st-code", "Письмо отправлено.", "ok");
      setCode("");
      show("s-code");
      const first = document.querySelector("#codebox input");
      if (first) first.focus();
    } catch (err) {
      setStatus("st-email", ruError(err), "err");
    } finally {
      $("b-send").disabled = false;
    }
  });

  $("f-code").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = getCode();
    if (token.length !== 6) {
      setStatus("st-code", "Введите все 6 цифр кода.", "err");
      return;
    }
    $("b-enter").disabled = true;
    setStatus("st-code", "Проверяем код…");
    try {
      const { error } = await client.auth.verifyOtp({
        email,
        token,
        type: "email"
      });
      if (error) throw error;
      await afterLogin();
    } catch (err) {
      setStatus("st-code", ruError(err), "err");
    } finally {
      $("b-enter").disabled = false;
    }
  });

  $("b-resend").addEventListener("click", async () => {
    if (!email) return show("s-email");
    const left = resendAt - Date.now();
    if (left > 0) {
      setStatus("st-code", "Повторно можно через " + Math.ceil(left / 1000) + " с.", "err");
      return;
    }
    $("b-resend").disabled = true;
    try {
      await sendOtp(email);
      setStatus("st-code", "Новое письмо отправлено. Проверьте входящие и спам.", "ok");
    } catch (err) {
      setStatus("st-code", ruError(err), "err");
    } finally {
      $("b-resend").disabled = false;
    }
  });

  $("b-back").addEventListener("click", () => {
    show("s-email");
    setStatus("st-email", "");
  });

  $("b-out").addEventListener("click", async () => {
    try { await client.auth.signOut(); } catch (_) {}
    show("s-email");
    setStatus("st-email", "");
  });

  setupCodeInputs();

  (async function boot() {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (session) await afterLogin();
    } catch (_) {}
    client.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        if (document.getElementById("s-wait") || document.getElementById("s-email")) {
          afterLogin();
        }
      }
    });
  })();
})();
