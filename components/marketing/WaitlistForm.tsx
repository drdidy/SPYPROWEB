"use client";
import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Check } from "lucide-react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { track } from "@/lib/analytics";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    track({ name: "waitlist_submit_attempt" });
    if (!email.includes("@")) {
      track({ name: "waitlist_submit_error", reason: "client_validation" });
      return;
    }
    setPending(true);
    // simulated submission — replaced by /api/waitlist call in g4.
    setTimeout(() => {
      setPending(false);
      setSubmitted(true);
      track({ name: "waitlist_submit_success" });
    }, 600);
  }

  return (
    <section id="waitlist" className="border-t border-rule bg-paper">
      <div className="max-w-[1240px] mx-auto px-7 py-20 lg:py-28">
        <SectionLabel number="06">Join the closed beta</SectionLabel>

        <div className="mt-10 grid grid-cols-12 gap-10 items-end">
          <div className="col-span-12 lg:col-span-7">
            <h2 className="font-serif text-display lg:text-[56px] lg:leading-[1.04] tracking-tight text-ink max-w-2xl">
              We open the workspace to a few traders at a time.
            </h2>
            <p className="mt-5 text-[16px] text-ink-2 leading-relaxed max-w-2xl">
              Leave your email and we'll send an invite when the next cohort
              opens. You'll also get the weekly Daily Brief in the meantime:
              yesterday's close, tomorrow's setup, so you can read along
              before you're in.
            </p>
          </div>

          <div className="col-span-12 lg:col-span-5">
            {submitted ? (
              <div className="surface rounded-card p-7 flex items-start gap-4">
                <div className="w-10 h-10 rounded-soft bg-bull-tint grid place-items-center text-bull-ink shrink-0">
                  <Check size={18} />
                </div>
                <div>
                  <h3 className="font-serif text-title text-ink mb-1">
                    You're on the list.
                  </h3>
                  <p className="text-[14px] text-ink-2 leading-relaxed">
                    We'll be in touch when the next cohort opens. Until then,
                    expect the Daily Brief in your inbox each morning at
                    6:30 AM ET.
                  </p>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="surface rounded-card p-6 space-y-4"
              >
                <label className="block">
                  <span className="eyebrow text-ink-3">Email</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@firm.com"
                    className="mt-2 w-full h-11 px-3 bg-paper-2 rounded-soft text-[15px] text-ink placeholder:text-ink-4 outline-none shadow-rule focus:shadow-[0_0_0_2px_rgba(184,130,31,0.32)] transition-shadow"
                  />
                </label>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={pending}
                >
                  {pending ? "Adding…" : "Request invite"}
                  {!pending && <ArrowRight size={15} />}
                </Button>
                <p className="text-[11px] text-ink-3 text-center">
                  No spam. One email per week, plus an invite when ready.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
