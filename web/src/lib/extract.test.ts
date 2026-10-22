// Upload safety: unsupported types and oversized files are refused before any parsing.
import JSZip from "jszip";
import { DOMParser as LinkedomParser } from "linkedom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_FILE_MB, epub, extract } from "./extract";

describe("extract", () => {
  it("refuses unsupported types and files over the size limit", async () => {
    await expect(extract(new File(["x"], "virus.exe"))).rejects.toThrow(/unsupported file type/);
    const big = new File(["x"], "big.txt");
    Object.defineProperty(big, "size", { value: MAX_FILE_MB * 1e6 + 1 });
    await expect(extract(big)).rejects.toThrow(/larger than/);
  });
  it("reads a small text file", async () => {
    expect((await extract(new File(["Hello\r\nworld"], "a.txt"))).text).toBe("Hello\nworld");
  });
});

describe("EPUB", () => {
  const book = async (extra: Record<string, string> = {}) => {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip");
    zip.file("META-INF/container.xml", `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
    zip.file("OEBPS/content.opf", `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0">
      <metadata><dc:title>Moving Databases</dc:title><dc:creator>Asha Rao</dc:creator><dc:publisher>Open Press</dc:publisher><dc:date>2021-05-01</dc:date><dc:identifier>urn:isbn:978-0-13-468599-1</dc:identifier></metadata>
      <manifest><item id="c2" href="Text/two.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="Text/one.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`);
    zip.file("OEBPS/Text/one.xhtml", "<html><body><h1>Chapter one</h1><p>Plan the schema first.</p></body></html>");
    zip.file("OEBPS/Text/two.xhtml", "<html><body><p>Then move the data.</p></body></html>");
    for (const [k, v] of Object.entries(extra)) zip.file(k, v);
    return zip.generateAsync({ type: "arraybuffer" });
  };
  beforeAll(() => vi.stubGlobal("DOMParser", LinkedomParser));
  afterAll(() => vi.unstubAllGlobals());

  it("reads the chapters in spine order, with the book's details", async () => {
    const x = await epub(await book());
    expect(x.text).toBe("Chapter one\n\nPlan the schema first.\n\nThen move the data.");
    expect(x.meta).toMatchObject({ title: "Moving Databases", publisher: "Open Press", year: "2021", isbn: "9780134685991", authors: [{ family: "Rao", given: "Asha" }] });
  });
  it("refuses a DRM-protected e-book", async () => {
    const drm = await book({ "META-INF/encryption.xml": `<encryption><EncryptedData><CipherData><CipherReference URI="OEBPS/Text/one.xhtml"/></CipherData></EncryptedData></encryption>` });
    await expect(epub(drm)).rejects.toThrow(/DRM/);
  });
});
