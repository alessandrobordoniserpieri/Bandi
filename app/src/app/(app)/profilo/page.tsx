import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SECTION_META } from "@/lib/profile/constants";
import { profileCompletion } from "@/lib/profile/completion";
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

export default async function ProfiloPage() {
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

  return (
    <main>
      <div className="page-header">
        <h1>Il mio profilo</h1>
      </div>
      <CompletionBar percent={percent} />
      {suggestions.length > 0 && (
        <ul className="profile-hints">
          {suggestions.map((s) => <li key={s.section}>{s.message}</li>)}
        </ul>
      )}

      <details open>
        <summary>
          <span className="section-number">{SECTION_META.identity.n}</span>
          <span className="section-label">{SECTION_META.identity.label}</span>
          <span className="section-priority" data-priority={SECTION_META.identity.priority}>{SECTION_META.identity.priority}</span>
        </summary>
        <SectionForm section="identity"><SectionIdentity defaultValue={row} /></SectionForm>
      </details>
      <details>
        <summary>
          <span className="section-number">{SECTION_META.territory.n}</span>
          <span className="section-label">{SECTION_META.territory.label}</span>
          <span className="section-priority" data-priority={SECTION_META.territory.priority}>{SECTION_META.territory.priority}</span>
        </summary>
        <SectionForm section="territory"><SectionTerritory defaultValue={row} /></SectionForm>
      </details>
      <details>
        <summary>
          <span className="section-number">{SECTION_META.themes.n}</span>
          <span className="section-label">{SECTION_META.themes.label}</span>
          <span className="section-priority" data-priority={SECTION_META.themes.priority}>{SECTION_META.themes.priority}</span>
        </summary>
        <SectionForm section="themes"><SectionThemes defaultValue={row} /></SectionForm>
      </details>
      <details>
        <summary>
          <span className="section-number">{SECTION_META.capacity.n}</span>
          <span className="section-label">{SECTION_META.capacity.label}</span>
          <span className="section-priority" data-priority={SECTION_META.capacity.priority}>{SECTION_META.capacity.priority}</span>
        </summary>
        <SectionForm section="capacity"><SectionCapacity defaultValue={row} /></SectionForm>
      </details>
      <details>
        <summary>
          <span className="section-number">{SECTION_META.documents.n}</span>
          <span className="section-label">{SECTION_META.documents.label}</span>
          <span className="section-priority" data-priority={SECTION_META.documents.priority}>{SECTION_META.documents.priority}</span>
        </summary>
        <SectionForm section="documents">
          <SectionDocuments defaultValue={row} legalType={row.legal_type ?? undefined} />
        </SectionForm>
      </details>
      <details>
        <summary>
          <span className="section-number">{SECTION_META.partnerships.n}</span>
          <span className="section-label">{SECTION_META.partnerships.label}</span>
          <span className="section-priority" data-priority={SECTION_META.partnerships.priority}>{SECTION_META.partnerships.priority}</span>
        </summary>
        <SectionForm section="partnerships"><SectionPartnerships defaultValue={row} /></SectionForm>
      </details>
      <details>
        <summary>
          <span className="section-number">{SECTION_META.history.n}</span>
          <span className="section-label">{SECTION_META.history.label}</span>
          <span className="section-priority" data-priority={SECTION_META.history.priority}>{SECTION_META.history.priority}</span>
        </summary>
        <SectionForm section="history">
          <SectionHistory defaultValue={row} providers={providers ?? []} />
        </SectionForm>
      </details>
      <details>
        <summary>
          <span className="section-number">{SECTION_META.contacts.n}</span>
          <span className="section-label">{SECTION_META.contacts.label}</span>
          <span className="section-priority" data-priority={SECTION_META.contacts.priority}>{SECTION_META.contacts.priority}</span>
        </summary>
        <SectionForm section="contacts"><SectionContacts defaultValue={row} /></SectionForm>
      </details>

      <SectionNotifications
        initialThreshold={settings?.alert_threshold ?? DEFAULT_THRESHOLD}
        initialFrequency={settings?.alert_frequency ?? "weekly"}
      />
    </main>
  );
}
