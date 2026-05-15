import type { CertType } from './cert-number';

export interface ComposeBodyTextInput {
  type: CertType;
  program: string;          // e.g. "Web Development"
  duration: string;         // e.g. "3-Month Internship"
  startDateLabel: string;   // e.g. "1 March 2026"
  endDateLabel: string;     // e.g. "31 May 2026"
}

// Body paragraph rendered into the certificate PDF. Mirrors the phrasing
// baked into cert-template.png (which the renderer wipes and re-renders).
//
// INT is the only template we have an asset for right now. WRK and CRS will
// need their own template PNGs + their own copy variants — extend the
// switch below when those land.
export function composeBodyText(input: ComposeBodyTextInput): string {
  switch (input.type) {
    case 'INT':
      return (
        `has successfully completed a ${input.duration} in ${input.program} ` +
        `at Fraylon Technologies from ${input.startDateLabel} to ` +
        `${input.endDateLabel}. During the internship, the candidate ` +
        `demonstrated dedication, technical skills, and excellent performance ` +
        `in ${input.program} and project development.`
      );
    case 'WRK':
    case 'CRS':
      throw new Error(
        `composeBodyText: cert_type ${input.type} has no template yet ` +
          `(Phase 3 ships INT-only). Add a body variant + matching template ` +
          `PNG before issuing this type.`,
      );
  }
}
