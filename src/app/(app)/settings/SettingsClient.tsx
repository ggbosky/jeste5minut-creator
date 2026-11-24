"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, cx } from "@/components/ui";
import { KeysTab } from "./KeysTab";
import { VoicesTab } from "./VoicesTab";
import { ModelsTab } from "./ModelsTab";
import { BrandTab, ContentTab, NamingTab, RenderTab } from "./GeneralTabs";
import { AccountTab } from "./AccountTab";
import { UsersTab } from "./UsersTab";
import { SystemTab } from "./SystemTab";

const TABS = [
  { key: "keys", label: "API klíče", group: "Integrace" },
  { key: "voices", label: "Hlasy (ElevenLabs)", group: "Integrace" },
  { key: "models", label: "Modely (Claude)", group: "Integrace" },
  { key: "content", label: "Obsah a pravidla", group: "Produkce" },
  { key: "brand", label: "Brand a CTA", group: "Produkce" },
  { key: "render", label: "Render a rozvržení", group: "Produkce" },
  { key: "naming", label: "Pojmenování", group: "Produkce" },
  { key: "account", label: "Můj účet", group: "Účet" },
  { key: "users", label: "Uživatelé", group: "Účet", admin: true },
  { key: "system", label: "Systém", group: "Účet" },
];

export function SettingsClient({ role, me }: { role: string; me: { id: number; name: string; email: string; totp: boolean } }) {
  const sp = useSearchParams();
  const router = useRouter();
  const tab = sp.get("tab") ?? "keys";
  const isAdmin = role === "admin";
  const tabs = TABS.filter((t) => !t.admin || isAdmin);
  const groups = [...new Set(tabs.map((t) => t.group))];
  return (
    <div>
      <PageHeader title="Nastavení" subtitle="API klíče, hlasy, modely, pravidla obsahu, render a účty" />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {groups.map((g) => (
            <div key={g} className="contents lg:block lg:pb-3">
              <p className="text-3 hidden px-3 pb-1 text-[11px] font-bold uppercase tracking-wide lg:block">{g}</p>
              {tabs.filter((t) => t.group === g).map((t) => (
                <button
                  key={t.key}
                  onClick={() => router.replace(`/settings?tab=${t.key}`, { scroll: false })}
                  className={cx("w-full whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-semibold transition", tab === t.key ? "bg-navy-900 text-white" : "text-2 hover:bg-[var(--surface)]")}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0">
          {tab === "keys" && <KeysTab isAdmin={isAdmin} />}
          {tab === "voices" && <VoicesTab />}
          {tab === "models" && <ModelsTab />}
          {tab === "content" && <ContentTab />}
          {tab === "brand" && <BrandTab />}
          {tab === "render" && <RenderTab />}
          {tab === "naming" && <NamingTab />}
          {tab === "account" && <AccountTab me={me} />}
          {tab === "users" && isAdmin && <UsersTab meId={me.id} />}
          {tab === "system" && <SystemTab isAdmin={isAdmin} />}
        </div>
      </div>
    </div>
  );
}
