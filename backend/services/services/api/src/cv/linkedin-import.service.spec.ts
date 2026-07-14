import AdmZip from "adm-zip";
import { LinkedInImportService } from "./linkedin-import.service";

describe("LinkedInImportService", () => {
  const service = new LinkedInImportService();

  describe("isProfileUrl", () => {
    it("accepts real profile URLs", () => {
      expect(
        service.isProfileUrl("https://www.linkedin.com/in/paul-light-/"),
      ).toBe(true);
      expect(service.isProfileUrl("http://linkedin.com/in/jane")).toBe(true);
      expect(service.isProfileUrl("https://ng.linkedin.com/in/ada")).toBe(true);
    });

    it("rejects non-profile / empty URLs", () => {
      expect(service.isProfileUrl("")).toBe(false);
      expect(service.isProfileUrl(null)).toBe(false);
      expect(service.isProfileUrl("https://linkedin.com/company/edutu")).toBe(
        false,
      );
      expect(service.isProfileUrl("https://example.com/in/paul")).toBe(false);
    });
  });

  describe("normalizeUrl", () => {
    it("forces https, adds scheme, and strips query/trailing noise", () => {
      expect(service.normalizeUrl("linkedin.com/in/paul-light-/?utm=x")).toBe(
        "https://linkedin.com/in/paul-light-",
      );
      expect(
        service.normalizeUrl("http://www.linkedin.com/in/ada?trk=abc"),
      ).toBe("https://www.linkedin.com/in/ada");
    });
  });

  describe("import", () => {
    it("returns null for invalid URLs without hitting the network", async () => {
      await expect(service.import("not a url")).resolves.toBeNull();
      await expect(service.import(undefined)).resolves.toBeNull();
    });
  });

  describe("toCVData", () => {
    it("maps a profile into CV sections and does not clobber existing edits", () => {
      const cv = service.toCVData(
        {
          source: "proxycurl",
          full_name: "Paul Light",
          headline: "Founder",
          location: "Lagos, Nigeria",
          experiences: [
            { company: "Edutu", title: "Founder", start_date: "2024-01" },
          ],
          education: [{ school: "Nnamdi Azikiwe", degree: "BSc" }],
          skills: ["React", "React", "TypeScript"],
          projects: [],
          achievements: [],
        },
        { header: { full_name: "Paul O. Light" } as any },
      );

      expect(cv.header?.full_name).toBe("Paul O. Light"); // existing wins
      expect(cv.experience?.[0]?.role).toBe("Founder");
      expect(cv.education?.[0]?.institution).toBe("Nnamdi Azikiwe");
      expect(cv.skills).toEqual(["React", "TypeScript"]); // deduped
    });
  });

  describe("fromExport (ZIP / CSV)", () => {
    it("parses a LinkedIn 'Get a copy of your data' ZIP with quoted fields", async () => {
      const zip = new AdmZip();
      zip.addFile(
        "Profile.csv",
        Buffer.from(
          "First Name,Last Name,Headline,Summary,Geo Location\n" +
            'Paul,Light,Founder & CEO,"Building Edutu, an AI coach","Lagos, Nigeria"\n',
        ),
      );
      zip.addFile(
        "Positions.csv",
        Buffer.from(
          "Company Name,Title,Description,Location,Started On,Finished On\n" +
            'Edutu,Founder,"Built the product, led fundraising",Remote,Jan 2024,\n',
        ),
      );
      zip.addFile(
        "Skills.csv",
        Buffer.from("Name\nReact\nTypeScript\nLeadership\n"),
      );

      const profile = await service.fromExport({
        buffer: zip.toBuffer(),
        originalname: "Basic_LinkedInDataExport.zip",
      });

      expect(profile).not.toBeNull();
      expect(profile!.source).toBe("export-zip");
      expect(profile!.full_name).toBe("Paul Light");
      expect(profile!.summary).toBe("Building Edutu, an AI coach");
      expect(profile!.location).toBe("Lagos, Nigeria");
      expect(profile!.experiences[0]).toMatchObject({
        company: "Edutu",
        title: "Founder",
        current: true,
      });
      expect(profile!.skills).toEqual(["React", "TypeScript", "Leadership"]);
    });

    it("returns null for an empty / unrecognised file", async () => {
      await expect(
        service.fromExport({ buffer: Buffer.from(""), originalname: "x.zip" }),
      ).resolves.toBeNull();
    });
  });
});
