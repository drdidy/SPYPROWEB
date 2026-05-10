// Canonical name for the per-engine state pipeline stepper. The
// implementation lives in StatePipeline.tsx for back-compat with v1
// callers; this module re-exports the same component under its
// deliverable name.

export { StatePipeline as PipelineStepper } from "./StatePipeline";
