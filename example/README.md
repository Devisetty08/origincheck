# Examples

Sample files for trying origincheck, and the reports it produced from them. Everything here was made with the current app, so you can compare your own results.

## Try it

| File | Use it for |
|---|---|
| [`draft.docx`](draft.docx) | The document to check. A short report on moving an Oracle system to the cloud, with two copied passages. |
| [`references/azure.txt`](references/azure.txt), [`references/ora2pg.pdf`](references/ora2pg.pdf) | The two sources to add next to it. Expect a **47%** similarity index: 26% from azure.txt and 21% from ora2pg.pdf. |
| [`paragraph/paragraph.txt`](paragraph/paragraph.txt) and [`paragraph/source.txt`](paragraph/source.txt) | A paragraph and its source for **Paragraph check**. The second sentence is copied word for word. |
| [`library/references.bib`](library/references.bib) | A reference list for **My library → Reference file**: one open-access paper (its full text is added), one paywalled paper and one copyrighted book (both listed with where to get them). |

## What origincheck made from them

| File | What it is | How to make it |
|---|---|---|
| [`reports/originality_report.pdf`](reports/originality_report.pdf) | The 4-page originality report: cover page, the document with matches highlighted by source, the 47% summary with its breakdown, and the other checks | Check document → **Download report (PDF)** |
| [`reports/web_report.html`](reports/web_report.html) | The same report as an interactive web page | Check document → **Web report (.html)** |
| [`reports/paragraph_report.html`](reports/paragraph_report.html) | Paragraph check's report: before and after (1 too close → 2 original), the final paragraph and its APA reference | Paragraph check → rewrite the copied sentence → **HTML report** |
| [`reports/paragraph.docx`](reports/paragraph.docx) | The finished paragraph and its reference list, as a Word file | Paragraph check → **.docx** |
| [`reports/command_line_report.html`](reports/command_line_report.html) | The command-line tool's report for the same document and sources | `python origincheck.py example/draft.docx -s example/references --exclude-quotes --exclude-bib` |

The AI indicator and paraphrase detection were off when these were made. Both are optional, and the AI indicator needs at least 150 words.

The screenshots in the main README are in [`../docs/screenshots`](../docs/screenshots).
