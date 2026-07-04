// app/src/app/(app)/profilo/page.tsx
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

  const { percent, suggestions } = profileCompletion(row);

  return (
    <main>
      <h1>Il mio profilo</h1>
      <CompletionBar percent={percent} />
      {suggestions.length > 0 && (
        <ul>{suggestions.map((s) => <li key={s.section}>{s.message}</li>)}</ul>
      )}

      <details open>
        <summary>{SECTION_META.identity.n}. {SECTION_META.identity.label} — {SECTION_META.identity.priority}</summary>
        <SectionForm section="identity"><SectionIdentity defaultValue={row} /></SectionForm>
      </details>
      <details>
        <summary>{SECTION_META.territory.n}. {SECTION_META.territory.label} — {SECTION_META.territory.priority}</summary>
        <SectionForm section="territory"><SectionTerritory defaultValue={row} /></SectionForm>
      </details>
      <details>
        <summary>{SECTION_META.themes.n}. {SECTION_META.themes.label} — {SECTION_META.themes.priority}</summary>
        <SectionForm section="themes"><SectionThemes defaultValue={row} /></SectionForm>
      </details>
      <details>
        <summary>{SECTION_META.capacity.n}. {SECTION_META.capacity.label} — {SECTION_META.capacity.priority}</summary>
        <SectionForm section="capacity"><SectionCapacity defaultValue={row} /></SectionForm>
      </details>
      <details>
        <summary>{SECTION_META.documents.n}. {SECTION_META.documents.label} — {SECTION_META.documents.priority}</summary>
        <SectionForm section="documents">
          <SectionDocuments defaultValue={row} legalType={row.legal_type ?? undefined} />
        </SectionForm>
      </details>
      <details>
        <summary>{SECTION_META.partnerships.n}. {SECTION_META.partnerships.label} — {SECTION_META.partnerships.priority}</summary>
        <SectionForm section="partnerships"><SectionPartnerships defaultValue={row} /></SectionForm>
      </details>
      <details>
        <summary>{SECTION_META.history.n}. {SECTION_META.history.label} — {SECTION_META.history.priority}</summary>
        <SectionForm section="history">
          <SectionHistory defaultValue={row} providers={providers ?? []} />
        </SectionForm>
      </details>
      <details>
        <summary>{SECTION_META.contacts.n}. {SECTION_META.contacts.label} — {SECTION_META.contacts.priority}</summary>
        <SectionForm section="contacts"><SectionContacts defaultValue={row} /></SectionForm>
      </details>
    </main>
  );
}
