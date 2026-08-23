from pathlib import Path
import importlib.util

MODULE_PATH = Path(__file__).parents[1] / "database" / "supabase_client.py"
spec = importlib.util.spec_from_file_location("supabase_client", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)
SupabaseClient = module.SupabaseClient


def test_payload_persists_clean_summary_sections_and_quality_metadata():
    client = object.__new__(SupabaseClient)
    payload = client._to_payload(
        {
            "title": "African Founders Programme",
            "summary": "A practical programme helping African founders strengthen operations, profitability and long-term business growth through expert-led workshops and peer learning.",
            "description": "Paragraph one.\n\nParagraph two.",
            "organization": "Growth Hub",
            "category": "Business",
            "canonicalCategory": "programs",
            "deadline": "2026-09-30",
            "applyUrl": "https://official.example/apply?utm_source=feed",
            "source_url": "https://official.example/programme",
            "requirements": ["Own or manage a business."],
            "benefits": ["Expert-led workshops."],
            "applicationProcess": ["Complete the official form."],
            "quality_score": 88,
            "content_cleaning": {
                "version": "opportunity-content-v2",
                "removed_noise": 4,
                "removed_duplicates": 1,
                "paragraph_count": 2,
                "needs_review": False,
            },
        },
        "2026-08-23T20:00:00Z",
    )

    assert payload["summary"].startswith("A practical programme")
    assert payload["quality_score"] == 88
    assert payload["validation_status"] == "valid"
    assert payload["canonical_url"] == "https://official.example/apply"
    assert payload["metadata"]["application_process"] == ["Complete the official form."]
    assert payload["metadata"]["content_format_version"] == "opportunity-content-v2"
    assert payload["metadata"]["content_noise_removed"] == 4
    assert payload["metadata"]["description_length"] == len("Paragraph one.\n\nParagraph two.")
