export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Auth error page rendered by the /api/auth proxy when the upstream Better Auth
 * server redirects back with `?error=<code>`.
 *
 * The upstream page only shows the raw code, which leaves customers stuck in a
 * loop: a failed attempt keeps a stale OAuth state cookie, so every retry of the
 * old tab reports `state_mismatch` again. This page explains the situation and
 * starts a brand new sign-in (which overwrites the stale state cookie) in one click.
 */
export function renderAuthErrorPage(code?: string): string {
  const known = code ?? "unknown_error";
  const isStateError =
    known === "state_mismatch" ||
    known === "state_security_mismatch" ||
    known === "state_not_found" ||
    known === "invalid_state";
  const message = isStateError
    ? "Sesi login sebelumnya sudah tidak berlaku. Mulai login lagi untuk melanjutkan dengan aman."
    : "Terjadi kendala saat menyelesaikan login. Silakan coba lagi.";

  return `<!DOCTYPE html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Login gagal</title>
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      code { font-size: 0.8125rem; background: #f3f4f6; border-radius: 0.25rem; padding: 0.125rem 0.375rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
      button[disabled] { opacity: 0.7; cursor: progress; }
      .note { color: #b91c1c; margin: 1rem 0 0; font-size: 0.875rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Login belum selesai</h1>
      <p>${message}</p>
      <p>Kode: <code>${known}</code></p>
      <div class="actions">
        <button id="retry" class="primary" type="button">Mulai login lagi</button>
        <a class="secondary" href="/">Kembali ke beranda</a>
      </div>
      <p id="retry-note" class="note" hidden>Tidak bisa memulai login. Periksa koneksi lalu coba lagi.</p>
    </div>
    <script>
      (function () {
        var button = document.getElementById("retry");
        var note = document.getElementById("retry-note");
        if (!button) return;
        button.addEventListener("click", function () {
          button.disabled = true;
          button.textContent = "Menghubungkan…";
          if (note) note.hidden = true;
          fetch("/api/auth/sign-in/social", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "google",
              callbackURL: window.location.origin + "/profile",
            }),
          })
            .then(function (response) {
              return response.json();
            })
            .then(function (payload) {
              if (payload && payload.url) {
                window.location.assign(payload.url);
                return;
              }
              throw new Error("missing redirect url");
            })
            .catch(function () {
              button.disabled = false;
              button.textContent = "Mulai login lagi";
              if (note) note.hidden = false;
            });
        });
      })();
    </script>
  </body>
</html>`;
}
