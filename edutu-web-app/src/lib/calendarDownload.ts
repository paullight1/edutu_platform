import { fetchRoadmapCalendarExport } from "../services/roadmapApi";

/**
 * Downloads an adopted roadmap's calendar as a `.ics` file. The file imports
 * into Google Calendar, Apple Calendar, and Outlook (each event carries a
 * one-day-before reminder). Returns false if the calendar could not be built.
 */
export async function downloadRoadmapCalendar(
  enrollmentId: string,
  token?: string | null,
): Promise<boolean> {
  try {
    const { ics, filename } = await fetchRoadmapCalendarExport(
      enrollmentId,
      token,
    );
    if (!ics) return false;

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "roadmap.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error("Failed to download roadmap calendar", error);
    return false;
  }
}
