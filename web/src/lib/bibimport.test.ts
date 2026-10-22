import { describe, expect, it } from "vitest";
import { findCopyLinks, lookupLine, parseBibtex, parseRis, toMeta } from "./bibimport";

describe("reference file import", () => {
  it("reads BibTeX with nested braces, quotes and several authors", () => {
    const [a, b] = parseBibtex(`@comment{ignored}
@article{watson1953,
  title = {Molecular structure of {N}ucleic {A}cids},
  author = {Watson, James D. and Crick, Francis},
  journal = "Nature", year = 1953, volume = {171}, pages = {737--738},
  doi = {10.1038/171737a0}
}
@book{rao2021, title={Moving Databases}, author={Asha Rao}, publisher={Open Press}, year={2021}, isbn={978-0-13-468599-1}}`);
    expect(a).toMatchObject({ title: "Molecular structure of Nucleic Acids", authors: ["Watson, James D.", "Crick, Francis"], year: "1953", container: "Nature", doi: "10.1038/171737a0" });
    expect(toMeta(a).authors).toEqual([{ family: "Watson", given: "James D." }, { family: "Crick", given: "Francis" }]);
    expect(b).toMatchObject({ title: "Moving Databases", publisher: "Open Press", isbn: "978-0-13-468599-1" });
    expect(lookupLine(a)).toBe("10.1038/171737a0");
    expect(lookupLine(b)).toBe("Rao (2021) Moving Databases");
  });
  it("reads RIS", () => {
    const [e] = parseRis("TY  - BOOK\r\nTI  - Moving Databases\r\nAU  - Rao, Asha\r\nPY  - 2021///\r\nSN  - 9780134685991\r\nPB  - Open Press\r\nER  - \r\n");
    expect(e).toMatchObject({ title: "Moving Databases", authors: ["Rao, Asha"], year: "2021", isbn: "9780134685991", publisher: "Open Press" });
  });
  it("links to legal ways to read or borrow a book, never a download", () => {
    const links = findCopyLinks({ title: "Moving Databases", isbn: "978-0-13-468599-1", authors: [{ family: "Rao" }] });
    expect(links.map((l) => l.url)).toEqual([
      "https://openlibrary.org/isbn/9780134685991", "https://search.worldcat.org/search?q=bn:9780134685991", "https://books.google.com/books?vid=ISBN9780134685991"]);
  });
});
