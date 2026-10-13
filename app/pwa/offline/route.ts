export function GET() {
  return new Response('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOGIFA — Hors ligne</title><body style="font:16px system-ui;padding:2rem"><h1>Connexion indisponible</h1><p>Reconnectez-vous pour accéder à LOGIFA. Aucune opération n’a été enregistrée hors ligne.</p></body></html>', {headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate"}});
}
