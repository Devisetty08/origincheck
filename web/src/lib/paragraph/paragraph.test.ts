import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupDoi } from "../importer";
import { type PSource, citeFor, expectedForm, findCites, referenceList } from "./citations";
import { addCitation, fixFormat, grammarFix, quoteAndCite, redo, replaceSentence, undo } from "./fixes";
import { DEFAULTS, analyze, assessRewrite } from "./rules";
import { splitSentences } from "./sentences";

const SRC = "Managed database services reduce the operational burden on small teams because the provider handles patching and backups. "
  + "Azure Database for PostgreSQL flexible server is a fully managed database service designed to provide more granular control and flexibility over database management functions and configuration settings.";
const src: PSource = { id: "ms", title: "Azure overview", text: SRC, meta: { authors: [{ family: "Microsoft" }], title: "Azure Database for PostgreSQL flexible server", year: "2024", url: "https://learn.microsoft.com/azure/postgresql/" } };
const run = (t: string, o = {}) => analyze(t, [src], { ...DEFAULTS, ...o });
const first = (t: string, o = {}) => run(t, o).sentences[0];
const kinds = (t: string, o = {}) => first(t, o).issues.map((x) => x.kind);

describe("sentence splitting", () => {
  it("keeps abbreviations, initials, decimals and citations inside one sentence", () => {
    const t = "Smith et al. (2020) found it grew 3.5 times, e.g. in Fig. 3 and i.e. overall. J. Smith agreed. “It works.” Then it stopped";
    expect(splitSentences(t).map((x) => x.text)).toEqual([
      "Smith et al. (2020) found it grew 3.5 times, e.g. in Fig. 3 and i.e. overall.", "J. Smith agreed.", "“It works.”", "Then it stopped"]);
  });
  it("gives offsets into the paragraph", () => {
    const t = "One.  Two!";
    expect(splitSentences(t).map((x) => t.slice(x.s, x.e))).toEqual(["One.", "Two!"]);
  });
});

describe("rules", () => {
  const copied = "Managed database services reduce the operational burden on small teams because the provider handles patching and backups.";
  const swapped = "Managed database services lower the operational burden on small groups because the provider manages patching and backups.";
  const mine = "Because a cloud provider looks after patches and backups, our two-person team could spend that time testing the migration";

  it("a copied sentence is copied wording", () => {
    expect(kinds(copied)).toContain("copied");
    expect(first(copied).status).toBe("too-close");
  });
  it("the same sentence with three synonyms swapped is patchwriting, not copied", () => {
    expect(kinds(swapped)).toEqual(expect.arrayContaining(["patchwriting", "idea-uncited"]));
    expect(kinds(swapped)).not.toContain("copied");
    expect(first(swapped).issues.find((x) => x.kind === "patchwriting")!.message).toMatch(/same sentence structure as Source 1 \(Microsoft, 2024\) with 2 words changed/);
  });
  it("a genuinely rewritten sentence with a citation is original", () => {
    const s = first(`${mine} (Microsoft, 2024).`);
    expect(s.issues).toEqual([]);
    expect(s.status).toBe("original");
  });
  it("the rewritten sentence without a citation needs one", () => {
    expect(kinds(`${mine}.`)).toEqual(["idea-uncited"]);
    expect(first(`${mine}.`).status).toBe("needs-citation");
  });
  it("a cited quote is quoted, an uncited one needs a citation", () => {
    expect(first("As Microsoft puts it, “the provider handles patching and backups” (Microsoft, 2024).").status).toBe("quoted");
    expect(kinds("As Microsoft puts it, “the provider handles patching and backups”.")).toEqual(["quote-uncited"]);
  });
  it("a 50-word quote is too long, and a mostly quoted paragraph is flagged", () => {
    const q = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
    const a = run(`Microsoft writes “${q}” (Microsoft, 2024).`);
    expect(a.issues.map((x) => x.kind)).toEqual(expect.arrayContaining(["quote-long", "quote-heavy"]));
  });
  it("never flags allow-listed technical terms or cited quotations as copied", () => {
    expect(kinds("We picked Azure Database for PostgreSQL flexible server for the pilot.")).toEqual([]);
    expect(kinds(`“${copied.slice(0, -1)}” (Microsoft, 2024).`)).not.toContain("copied");
  });
  it("a sentence rewritten in the editor still needs its source's citation", () => {
    const t = "We moved the reporting jobs first because they were the least risky part.";
    expect(kinds(t)).toEqual([]);
    expect(kinds(t, { derived: [{ text: t, sid: 0 }] })).toEqual(["idea-uncited"]);
  });
  it("gives the verdict", () => {
    expect(run(`${mine} (Microsoft, 2024).`).verdict).toBe("Ready");
    expect(run(copied).verdict).toBe("Needs work");
  });
  it("the rewrite meter uses the same rules", () => {
    expect(assessRewrite(swapped, src, DEFAULTS).level).toBe("too-close");
    expect(assessRewrite(copied, src, DEFAULTS).reason).toMatch(/words in a row still match/);
    expect(assessRewrite(`${mine}.`, src, DEFAULTS).level).toBe("original");
  });
});

describe("citations", () => {
  const two: PSource[] = [src, { id: "o", title: "Ora2Pg", text: "x", meta: { authors: [{ family: "Darold", given: "Gilles" }], title: "Ora2Pg", year: "2023" } }];
  it("finds APA, Harvard, narrative and IEEE citations and matches them to sources", () => {
    const c = findCites("A (Microsoft, 2024). B (Darold 2023, p. 4). Darold (2023) says. C [2]. D (Smith, 2020).", two);
    expect(c.map((x) => [x.form, x.src, x.page ?? ""])).toEqual([["apa", 0, ""], ["harvard", 1, "p. 4"], ["narrative", 1, ""], ["ieee", 1, ""], ["apa", -1, ""]]);
  });
  it("corrects a citation into the chosen style, keeping the page", () => {
    const [h] = findCites("(Microsoft 2024)", two), [a] = findCites("(Darold, 2023, p. 4)", two);
    expect(expectedForm(h, two, "apa")).toBe("(Microsoft, 2024)");
    expect(expectedForm(a, two, "harvard")).toBe("(Darold 2023, p. 4)");
    expect(expectedForm(a, two, "ieee")).toBe("[2, p. 4]");
    expect(expectedForm(findCites("(Microsoft, 2024)", two)[0], two, "apa")).toBeNull();
    expect(citeFor(two, 1, "apa", "12")).toBe("(Darold, 2023, p. 12)");
  });
  it("flags a citation with no matching source and a wrongly formatted one", () => {
    expect(kinds("We relied on it (Smith, 2020).")).toContain("cite-no-ref");
    expect(kinds("We relied on it (Microsoft 2024).")).toContain("cite-format");
  });
});

describe("reference list", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("builds a reference from a DOI's metadata (network mocked), with citation-js for APA and the built-in fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("/api/doi")) return new Response(JSON.stringify({ authors: [{ family: "Watson", given: "James D." }, { family: "Crick", given: "Francis" }],
        title: "Molecular structure of nucleic acids", year: "1953", container: "Nature", volume: "171", issue: "4356", pages: "737-738", doi: "10.1038/171737a0" }));
      return new Response("", { status: 404 }); // CSL style files can't load here: the fallback takes over
    }));
    const meta = await lookupDoi("10.1038/171737a0");
    const s: PSource[] = [{ id: "d", title: meta.title, text: "", meta }];
    const apa = await referenceList(s, [0], "apa");
    expect(apa.engine).toBe("citation-js");
    expect(apa.entries[0].text).toMatch(/^Watson, J\. D\., & Crick, F\. \(1953\)\. Molecular structure of nucleic acids\. Nature, 171\(4356\), 737–738\. https:\/\/doi\.org\/10\.1038\/171737a0/);
    const harvard = await referenceList(s, [0], "harvard");
    expect(harvard.engine).toBe("built-in");
    expect(harvard.entries[0].text).toContain("Watson, J.D. and Crick, F. (1953)".replace("J.D.", "J. D."));
  });
});

describe("automatic fixes are previewable and undoable", () => {
  const t = "We chose it. The provider handles patching and backups for us.";
  const cases = [
    quoteAndCite(t, t.indexOf("The"), t.indexOf(" for us"), "(Microsoft, 2024)"),
    addCitation(t, 13, t.length, "(Microsoft, 2024)"),
    addCitation("He said “it works.”", 0, 19, "(Lee, 2021)"),
    fixFormat("It is (Microsoft 2024).", 6, 22, "(Microsoft, 2024)"),
    replaceSentence(t, 0, 12, "We picked a managed service."),
    grammarFix("This are fine.", { start: 5, end: 8 }, { text: "is", kind: "replace" }),
  ];
  it("produce the expected text", () => {
    expect(cases[0].text).toBe("We chose it. “The provider handles patching and backups” (Microsoft, 2024) for us.");
    expect(cases[1].text).toBe("We chose it. The provider handles patching and backups for us (Microsoft, 2024).");
    expect(cases[2].text).toBe("He said “it works” (Lee, 2021).");
    expect(cases[3].text).toBe("It is (Microsoft, 2024).");
    expect(cases[5].text).toBe("This is fine.");
  });
  it("undo restores the original and redo re-applies the fix", () => {
    const originals = [t, t, "He said “it works.”", "It is (Microsoft 2024).", t, "This are fine."];
    cases.forEach((f, i) => {
      expect(undo(f.text, f.change)).toBe(originals[i]);
      expect(redo(originals[i], f.change)).toBe(f.text);
    });
  });
});
