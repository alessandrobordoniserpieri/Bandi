import { deleteAccount } from "../../(auth)/actions";

export default function OnboardingPage() {
  return (
    <main>
      <h1>Completa il profilo</h1>
      <p>L'onboarding guidato (3 step) arriverà nel branch 004. Per ora, il tuo account è attivo.</p>
      <form action={deleteAccount}>
        <button type="submit">Elimina account</button>
      </form>
    </main>
  );
}
