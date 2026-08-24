from pathlib import Path
import importlib.util

MODULE_PATH = Path(__file__).parents[1] / "extractors" / "scholarship_extractor.py"
spec = importlib.util.spec_from_file_location("scholarship_extractor", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)
ScholarshipExtractor = module.ScholarshipExtractor


def test_extract_preserves_paragraphs_and_structured_sections_without_page_chrome():
    extractor = ScholarshipExtractor()
    html = """
    <article class="opportunity-card">
      <nav>Home | About | Privacy Policy</nav>
      <div class="advertisement">Advertisement</div>
      <h2 class="title">Youth Leadership Fellowship 2026</h2>
      <p class="organization">Africa Leadership Network</p>
      <div class="content">
        <p>The fellowship supports emerging African leaders with practical training and mentorship.</p>
        <p>Participants build leadership skills, professional networks and community projects.</p>
        <h3>Eligibility</h3>
        <ul><li>Applicants must be 18 to 30 years old.</li><li>Applicants must live in Africa.</li></ul>
        <h3>Benefits</h3>
        <ul><li>Leadership training</li><li>Mentorship</li></ul>
        <h3>How to apply</h3>
        <ol><li>Complete the online form.</li><li>Upload a CV.</li></ol>
      </div>
      <div class="share-buttons">Share this post</div>
      <a href="/apply">Apply now</a>
    </article>
    """

    items = extractor.extract_from_html(
        html,
        "Official programme",
        "https://example.org/fellowship",
    )

    assert len(items) == 1
    item = items[0]
    assert "\n\n" in item["description"]
    assert "Advertisement" not in item["description"]
    assert "Privacy Policy" not in item["description"]
    assert "Share this post" not in item["description"]
    assert item["requirements"] == [
        "Applicants must be 18 to 30 years old.",
        "Applicants must live in Africa.",
    ]
    assert item["benefits"] == ["Leadership training", "Mentorship"]
    assert item["application_process"] == [
        "Complete the online form.",
        "Upload a CV.",
    ]
    assert item["apply_url"] == "https://example.org/apply"


def test_parse_date_keeps_explicit_day_in_numeric_and_written_deadlines():
    extractor = ScholarshipExtractor()

    assert extractor._parse_date("July 29, 2026") == "2026-07-29"
    assert extractor._parse_date("29 July 2026") == "2026-07-29"
    assert extractor._parse_date("07/29/2026") == "2026-07-29"
