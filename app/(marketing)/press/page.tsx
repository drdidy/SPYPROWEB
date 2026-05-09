import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Press · SPY Prophet",
  description: "Press inquiries and media kit for SPY Prophet.",
};

export default function PressPage() {
  return (
    <LegalPage eyebrow="Press" title="Press inquiries." lastUpdated="2026-05-09">
      <p>
        SPY Prophet is in closed beta. We don&apos;t have published press at
        this time. Once a press cycle exists, this page will host the kit.
      </p>

      <h3>Inquiries</h3>
      <p>
        <a href="mailto:press@spyprophet.app">press@spyprophet.app</a>.
        Please include outlet, deadline, and the angle you&apos;re working on.
      </p>

      <h3>Style</h3>
      <p>
        Brand name: <strong>SPY Prophet</strong> (two words). Use lowercase
        &quot;the workspace&quot; in body copy. We are <em>not</em> a signal
        service.
      </p>
    </LegalPage>
  );
}
