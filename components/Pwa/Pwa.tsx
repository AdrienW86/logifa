"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import styles from "./pwa.module.css";
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
function isInstallEvent(event: Event): event is InstallEvent {
  return (
    "prompt" in event &&
    typeof event.prompt === "function" &&
    "userChoice" in event &&
    event.userChoice instanceof Promise
  );
}
export function PrivateSessionBoundary({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth(),
    pathname = usePathname();
  const privatePage =
    pathname !== "/access-denied" && !pathname.startsWith("/sign-in");
  useEffect(() => {
    if (privatePage && isLoaded && !isSignedIn)
      window.location.replace("/sign-in");
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted && privatePage) {
        document.documentElement.dataset.logifaLocked = "true";
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", restore);
    const hide = () => {
      if (privatePage) document.documentElement.dataset.logifaLocked = "true";
    };
    window.addEventListener("pagehide", hide);
    delete document.documentElement.dataset.logifaLocked;
    return () => {
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("pagehide", hide);
    };
  }, [privatePage, isLoaded, isSignedIn]);
  return privatePage && (!isLoaded || !isSignedIn) ? (
    <p className={styles.check}>Vérification de votre session sécurisée…</p>
  ) : (
    <div id="logifa-private-root">{children}</div>
  );
}
export default function Pwa() {
  const [offline, setOffline] = useState(false),
    [restored, setRestored] = useState(false),
    [install, setInstall] = useState<InstallEvent | null>(null),
    [ios, setIos] = useState(false),
    [mobile, setMobile] = useState(false),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloadRequested = useRef(false);
  useEffect(() => {
    let wasOffline = !navigator.onLine;
    const network = () => {
      if (wasOffline && navigator.onLine) setRestored(true);
      wasOffline = !navigator.onLine;
      setOffline(wasOffline);
    };
    network();
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    const offered = (event: Event) => {
      if (!isInstallEvent(event)) return;
      event.preventDefault();
      setInstall(event);
    };
    const installed = () => {
      setInstall(null);
      setIos(false);
    };
    window.addEventListener("beforeinstallprompt", offered);
    window.addEventListener("appinstalled", installed);
    const standalone =
      matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && navigator.standalone === true);
    setMobile(!standalone && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    setIos(
      !standalone &&
        (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)),
    );
    let alive = true;
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          if (!alive) return;
          if (registration.waiting) setWaiting(registration.waiting);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (
                alive &&
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setWaiting(worker);
            });
          });
          void registration.update().catch(() => {});
        })
        .catch(() => {});
    }
    const changed = () => {
      if (reloadRequested.current) window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", changed);
    return () => {
      alive = false;
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      window.removeEventListener("beforeinstallprompt", offered);
      window.removeEventListener("appinstalled", installed);
      navigator.serviceWorker?.removeEventListener("controllerchange", changed);
    };
  }, []);
  return (
    <aside className={styles.status} aria-label="Application et connexion">
      {offline && (
        <p role="status">
          Vous êtes hors ligne. Les opérations serveur ne sont pas enregistrées.
          Reconnectez-vous puis réessayez explicitement ; aucun envoi
          automatique.
        </p>
      )}
      {!offline && restored && (
        <p role="status">
          Connexion rétablie. Réessayez les opérations non confirmées ; aucune
          écriture n’a été renvoyée automatiquement.{" "}
          <button onClick={() => setRestored(false)}>Fermer</button>
        </p>
      )}
      {waiting && (
        <p>
          Une nouvelle version est disponible.{" "}
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Enregistrez ou exportez vos modifications avant de recharger. Mettre à jour maintenant ?",
                )
              ) {
                reloadRequested.current = true;
                waiting.postMessage({ type: "ACTIVATE_UPDATE" });
              }
            }}
          >
            Mettre à jour
          </button>
        </p>
      )}
      {install && (
        <button
          onClick={async () => {
            await install.prompt();
            await install.userChoice;
            setInstall(null);
          }}
        >
          Installer LOGIFA
        </button>
      )}
      {mobile && !ios && !install && (
        <details>
          <summary>Installer LOGIFA sur Android</summary>
          <p>Dans Chrome, ouvrez le menu ⋮ puis « Installer l’application » ou « Ajouter à l’écran d’accueil ». L’invite automatique dépend du navigateur.</p>
        </details>
      )}
      {ios && (
        <details>
          <summary>Installer sur iPhone / iPad</summary>
          <p>
            Dans Safari, ouvrez Partager puis « Sur l’écran d’accueil ». LOGIFA
            s’ouvrira dans sa propre fenêtre.
          </p>
        </details>
      )}
    </aside>
  );
}
