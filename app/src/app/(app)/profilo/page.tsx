import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SECTION_META } from "@/lib/profile/constants";
import { profileCompletion } from "@/lib/profile/completion";
import {
  PROFILE_SUBNAV_KEYS,
  firstIncompleteSection,
  priorityLabel,
  resolveActiveSection,
  subNavLabel,
  type SubNavKey,
} from "@/lib/profile/navigation";
import type { ProfileRow } from "@/lib/profile/schema";
import { CompletionBar } from "@/components/profile/completion-bar";
import { SectionForm } from "./section-form";
import { SectionIdentity } from "@/components/profile/section-identity";
import { SectionTerritory } from "@/components/profile/section-territory";
import { SectionThemes } from "@/components/profile/section-themes";
import { SectionCapacity } from "@/components/profile/section-capacity";
import { SectionDocuments } from "@/components/profile/section-documents";
import { SectionPartnerships } from "@/components/profile/section-partnerships";
import { SectionHistory } from "@/components/profile/section-history";
import { SectionContacts } from "@/components/profile/section-contacts";
import { SectionNotifications } from "@/components/profile/section-notifications";
import { DEFAULT_THRESHOLD } from "@/lib/alerts/build-digest";

type ProviderOption = { id: string; name: string };

// searchParams is a Promise in Next.js 16 (page.js API reference); it must be
// awaited, and reading it opts the route into request-time dynamic rendering —
// which the sub-nav (DEC-4) needs, since the active section comes from the URL.
export default async function ProfiloPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");
  const row = profile as ProfileRow;

  const { data: providers } = await supabase
    .from("grant_providers").select("id,name").order("name");

  const { data: settings } = await supabase
    .from("user_settings").select("alert_threshold, alert_frequency").eq("user_id", user.id).maybeSingle();

  const { percent, suggestions } = profileCompletion(row);

  const { sezione } = await searchParams;
  const active = resolveActiveSection(sezione, firstIncompleteSection(suggestions));

  return (
    <main className="profile-page">
      <div className="page-header">
        <h1>Il mio profilo</h1>
      </div>
      <CompletionBar percent={percent} />
      {suggestions.length > 0 && (
        <ul className="profile-hints">
          {suggestions.map((s) => <li key={s.section}>{s.message}</li>)}
        </ul>
      )}

      <div className="profile-layout">
        <nav className="profile-subnav" aria-label="Sezioni del profilo">
          <ul>
            {PROFILE_SUBNAV_KEYS.map((key) => {
              const isMeta = key === "notifiche";
              return (
                <li key={key}>
                  <Link
                    href={`/profilo?sezione=${key}`}
                    className="profile-subnav-link"
                    data-kind={isMeta ? "meta" : "section"}
                    aria-current={key === active ? "page" : undefined}
                  >
                    <span className="profile-subnav-index" aria-hidden>
                      {isMeta ? "" : SECTION_META[key].n}
                    </span>
                    <span className="profile-subnav-label">{subNavLabel(key)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="profile-section-panel">
          <ActiveSection
            active={active}
            row={row}
            providers={providers ?? []}
            settings={settings}
          />
        </div>
      </div>
    </main>
  );
}

/** Renders only the section selected by the sub-nav — one section at a time. */
function ActiveSection({
  active,
  row,
  providers,
  settings,
}: {
  active: SubNavKey;
  row: ProfileRow;
  providers: ProviderOption[];
  settings: { alert_threshold: number | null; alert_frequency: string | null } | null;
}) {
  // Notifiche brings its own heading (settings-card <h2>); the scored sections
  // get a shared heading + a readable priority badge (never the raw token).
  if (active === "notifiche") {
    return (
      <section aria-labelledby="profile-section-heading">
        <h2 id="profile-section-heading" className="sr-only">Notifiche</h2>
        <SectionNotifications
          initialThreshold={settings?.alert_threshold ?? DEFAULT_THRESHOLD}
          initialFrequency={(settings?.alert_frequency as "weekly" | "off") ?? "weekly"}
        />
      </section>
    );
  }

  const meta = SECTION_META[active];
  return (
    <section aria-labelledby="profile-section-heading">
      <header className="profile-section-head">
        <h2 id="profile-section-heading">{meta.label}</h2>
        <span className="section-priority" data-priority={meta.priority}>
          {priorityLabel(meta.priority)}
        </span>
      </header>
      <SectionForm section={active}>
        <SectionFields active={active} row={row} providers={providers} />
      </SectionForm>
    </section>
  );
}

function SectionFields({
  active,
  row,
  providers,
}: {
  active: Exclude<SubNavKey, "notifiche">;
  row: ProfileRow;
  providers: ProviderOption[];
}) {
  switch (active) {
    case "identity":     return <SectionIdentity defaultValue={row} />;
    case "territory":    return <SectionTerritory defaultValue={row} />;
    case "themes":       return <SectionThemes defaultValue={row} />;
    case "capacity":     return <SectionCapacity defaultValue={row} />;
    case "documents":    return <SectionDocuments defaultValue={row} legalType={row.legal_type ?? undefined} />;
    case "partnerships": return <SectionPartnerships defaultValue={row} />;
    case "history":      return <SectionHistory defaultValue={row} providers={providers} />;
    case "contacts":     return <SectionContacts defaultValue={row} />;
  }
}
