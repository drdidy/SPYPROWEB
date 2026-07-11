export default function Loading() {
  return (
    <div className="hatch-dark grid min-h-[60vh] place-items-center bg-optic p-8 text-center">
      <div>
        <span
          className="mx-auto grid h-10 w-10 place-items-center border border-carbon/25"
          aria-hidden="true"
        >
          <span className="h-1.5 w-1.5 animate-blink bg-cobalt" />
        </span>
        <p className="microlabel mt-5 text-carbon/60">Verifying source</p>
      </div>
    </div>
  );
}
