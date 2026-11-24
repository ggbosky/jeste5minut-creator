import { createRoot } from "react-dom/client";
import { ToastProvider } from "@/components/ui";
import { App } from "./App";
import { startJobs } from "./engine/jobs";
import "./index.css";

async function boot() {
  const root = createRoot(document.getElementById("root")!);
  if (!("serviceWorker" in navigator)) {
    root.render(<p style={{ padding: 40 }}>Tento prohlížeč nepodporuje service workery (nebo běží v anonymním režimu). Použij aktuální Chrome, Edge nebo Firefox.</p>);
    return;
  }
  await navigator.serviceWorker.register("./sw.js", { type: "module", scope: "./" });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((res) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => res(), { once: true });
      setTimeout(() => res(), 3000);
    });
    if (!navigator.serviceWorker.controller) return window.location.reload();
  }
  startJobs();
  try {
    const t = localStorage.getItem("j5m-theme");
    if (t) document.documentElement.dataset.theme = t;
  } catch {}
  root.render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}
boot();
