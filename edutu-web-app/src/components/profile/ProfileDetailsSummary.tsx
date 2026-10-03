import type { ReactNode } from "react";

export interface ProfileDetailsSummaryProps {
  fullName?: string | null;
  country?: string | null;
  school?: string | null;
  courseOfStudy?: string | null;
  degree?: string | null;
  cgpa?: string | number | null;
  gradYear?: string | number | null;
  dateOfBirth?: string | null;
  interestedCountries?: string[] | null;
  interests?: string[] | null;
  skills?: string[] | null;
}

export function ProfileDetailsSummary(props: ProfileDetailsSummaryProps) {
  const rows: Array<{ label: string; value: ReactNode; wide?: boolean }> = [
    { label: "Full name", value: props.fullName },
    { label: "Country", value: props.country },
    { label: "School", value: props.school },
    { label: "Course of study", value: props.courseOfStudy },
    { label: "Degree level", value: props.degree },
    { label: "CGPA", value: props.cgpa },
    { label: "Graduation year", value: props.gradYear },
    { label: "Date of birth", value: props.dateOfBirth },
    {
      label: "Interested countries",
      value: formatList(props.interestedCountries),
      wide: true,
    },
    { label: "Opportunity interests", value: formatList(props.interests), wide: true },
    { label: "Skills", value: formatList(props.skills), wide: true },
  ].filter(({ value }) => hasValue(value));

  if (rows.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No other profile details yet. Add a few to improve your matches.
      </p>
    );
  }

  return (
    <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 sm:gap-x-6 sm:gap-y-4">
      {rows.map(({ label, value, wide }) => (
        <div key={label} className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
          <dt className="text-xs font-medium text-text-muted">{label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-text-primary">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function formatList(values?: string[] | null): string | null {
  const cleaned = values?.map((value) => value.trim()).filter(Boolean) ?? [];
  return cleaned.length > 0 ? cleaned.join(", ") : null;
}

function hasValue(value: ReactNode): boolean {
  return value !== null && value !== undefined && value !== "";
}
