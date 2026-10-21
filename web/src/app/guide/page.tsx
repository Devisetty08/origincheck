import type { Metadata } from "next";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Avoiding plagiarism – origincheck guide" };

// Plain links: the guide is a static page, so a full load is simplest.
const HOME = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
const H2 = "mt-8 text-xl font-bold tracking-tight";
const Example = ({ label, children, tone }: { label: string; children: React.ReactNode; tone: string }) => (
  <div className={`mt-2 rounded-lg border-l-4 bg-panel p-3 ${tone}`}>
    <div className="text-[12px] font-semibold uppercase tracking-wide text-mute">{label}</div>
    <p className="font-serif">{children}</p>
  </div>
);

export default function Guide() {
  return (
    <>
      <header className="top sticky top-0 z-30 flex min-h-14 items-center gap-3 bg-top px-4 text-white">
        <a href={HOME} className="flex items-center gap-2 text-lg font-bold"><Logo /><span>origincheck</span></a>
        <a href={HOME} className="ml-auto rounded-lg border border-white/30 bg-white/12 px-3 py-1.5 text-sm font-medium hover:bg-white/22">Back to the checker</a>
      </header>
      <main className="mx-auto max-w-[760px] px-4 pt-8 pb-16 text-[15.5px] leading-relaxed">
        <h1 className="text-[clamp(24px,4vw,32px)] font-bold tracking-tight">A short guide to avoiding plagiarism</h1>
        <p className="mt-2 text-mute">Plagiarism is presenting someone else&apos;s words or ideas as your own. The fix is almost always the same: make it clear what came from where.</p>

        <h2 className={H2}>When to quote</h2>
        <p>Quote when the exact wording matters: a definition, a striking phrase, a claim you are about to analyse, or wording you can&apos;t improve without changing the meaning. Keep quotations short and use them sparingly — most of your text should be your own.</p>
        <ul className="mt-2 list-disc pl-6">
          <li>Copy the words exactly and put them in quotation marks.</li>
          <li>Cite the source straight after the quotation, with a page number if your style asks for one.</li>
          <li>Explain what the quotation shows. A quote doesn&apos;t make your point for you.</li>
        </ul>

        <h2 className={H2}>How to paraphrase</h2>
        <p>A paraphrase restates an idea in your own words and your own sentence structure. Swapping a few words for synonyms is not enough — that&apos;s still the source&apos;s sentence.</p>
        <ol className="mt-2 list-decimal pl-6">
          <li>Read the passage until you understand it.</li>
          <li>Close or hide the source.</li>
          <li>Write the idea from memory, the way you would explain it to someone else. Start with your own point, then use the source as evidence.</li>
          <li>Compare with the source. If you kept a run of its words or its sentence order, rewrite again or quote that phrase.</li>
          <li>Cite the source. A paraphrase still needs a citation.</li>
        </ol>
        <Example label="Source" tone="border-accent">Migrating from Oracle to PostgreSQL requires careful assessment of schema objects, stored procedures and data types.</Example>
        <Example label="Too close (synonym swap)" tone="border-high">Moving from Oracle to PostgreSQL needs a careful review of schema objects, stored procedures and data types.</Example>
        <Example label="Paraphrase" tone="border-low">Before switching databases, teams should check which Oracle features — especially procedural code and column types — will need rework in PostgreSQL (Author, 2024).</Example>

        <h2 className={H2}>How to cite</h2>
        <p>Every idea, fact or wording you took from a source needs an in-text citation and a matching entry in your reference list. Use the style your course asks for — origincheck can format APA 7, Harvard and IEEE.</p>
        <ul className="mt-2 list-disc pl-6">
          <li><b>APA 7:</b> (Smith &amp; Lee, 2021) · reference list sorted by author.</li>
          <li><b>Harvard:</b> (Smith and Lee 2021) · reference list sorted by author.</li>
          <li><b>IEEE:</b> [1] · references numbered in order of first citation.</li>
        </ul>
        <p className="mt-2">You don&apos;t need to cite common knowledge (facts most readers know and can find in many general sources) or your own original ideas. When in doubt, cite.</p>

        <h2 className={H2}>Reusing your own work</h2>
        <p>Submitting work you&apos;ve already handed in elsewhere usually counts as self-plagiarism. Cite your earlier work, or get permission to reuse it.</p>

        <h2 className={H2}>Reading a similarity score</h2>
        <p>The similarity index measures shared wording, not misconduct. A moderate score made up of correctly quoted and cited material is normal. Aim for every borrowed idea to be credited — not for 0%. Never use tools that disguise copied or AI-generated text; that is misconduct in itself.</p>
        <p className="mt-6"><a href={HOME} className="text-accent underline">Back to the checker</a></p>
      </main>
    </>
  );
}
