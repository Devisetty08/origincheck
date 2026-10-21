"""Smoke test: the dashboard renders every tab for a real draft without errors.  Run: python test_app.py"""
from pathlib import Path

from streamlit.testing.v1 import AppTest

DRAFT = (
    "Furthermore, it is important to note that the platform works well, e.g. under heavy load. In today's fast-paced world, "
    "teams leverage robust tools to navigate the complexities of an ever-evolving landscape, and they need systems that "
    "scale seamlessly across regions, vendors, time zones and budgets without anyone noticing the effort involved.\n\n"
    "The team ran the test. The team saw the result. The team wrote the note. The team sent the file.\n\n"
    "In conclusion, the cutting-edge platform delivers."
)

at = AppTest.from_file(str(Path(__file__).with_name("app.py")), default_timeout=60).run()
assert not at.exception, at.exception
at.text_area(key="draft").set_value(DRAFT).run()
assert not at.exception, at.exception

metrics = {m.label: m.value for m in at.metric}
assert metrics["Sentences"] == "7" and metrics["Long sentences"] == "1", metrics
assert int(metrics["Stock phrases"]) >= 8, metrics
assert any("Paragraph 2" in w.value for w in at.warning), [w.value for w in at.warning]
assert any("platform" in str(df.value) or "team" in str(df.value) for df in at.dataframe)
assert len(at.tabs) == 5
print("app smoke test passed:", metrics)
