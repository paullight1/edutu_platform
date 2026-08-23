from pathlib import Path
import importlib.util

MODULE_PATH = Path(__file__).parents[1] / "processors" / "data_cleaner.py"
spec = importlib.util.spec_from_file_location("data_cleaner", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)
DataCleaner = module.DataCleaner


def test_clean_preserves_readable_paragraphs_and_removes_advert_noise():
    cleaner = DataCleaner()
    result = cleaner.clean({
        "title": "Wema SME Business School 6.0",
        "organization": "Wema Bank",
        "description": """
        Home | About | Privacy Policy
        Advertisement
        The programme supports entrepreneurs and small business owners with practical training.
        It runs from 27 to 29 July 2026 and combines an in-person opening day with virtual sessions.
        Apply now
        Share this post
        Participants receive expert guidance on operations, profitability and sustainable growth.
        Participants receive expert guidance on operations, profitability and sustainable growth.
        Join our WhatsApp channel for more opportunities.
        """,
        "requirements": ["Own or manage an SME", "Click here to apply"],
        "benefits": ["Expert-led training", "Subscribe to our newsletter"],
        "application_process": ["Complete the official application form", "Apply now"],
        "apply_url": "https://official.example/apply",
        "source": "Official source",
    })

    assert "Advertisement" not in result["description"]
    assert "Privacy Policy" not in result["description"]
    assert "Apply now" not in result["description"]
    assert "WhatsApp" not in result["description"]
    assert result["description"].count("expert guidance") == 1
    assert "\n\n" in result["description"]
    assert result["requirements"] == ["Own or manage an SME"]
    assert result["benefits"] == ["Expert-led training"]
    assert result["applicationProcess"] == ["Complete the official application form"]


def test_clean_builds_summary_and_quality_metadata_without_inventing_facts():
    cleaner = DataCleaner()
    result = cleaner.clean({
        "title": "African Founders Growth Programme",
        "organization": "Growth Hub",
        "description": (
            "The programme helps African founders improve business operations and profitability. "
            "Participants attend practical workshops and receive expert guidance. "
            "They also build peer networks that support sustainable growth. "
            "The programme is open to early-stage business owners."
        ),
        "requirements": ["Applicants must own an early-stage business."],
        "benefits": ["Practical workshops", "Expert guidance"],
        "applicationProcess": ["Submit the official online form."],
        "deadline": "2026-09-30",
        "apply_url": "https://official.example/apply",
        "source": "Growth Hub",
    })

    assert 20 <= len(result["summary"].split()) <= 55
    assert result["deadline"] == "2026-09-30"
    assert result["applyUrl"] == "https://official.example/apply"
    assert result["quality_score"] >= 75
    assert result["content_cleaning"]["version"] == "opportunity-content-v2"


def test_clean_extracts_labeled_lists_from_description_when_arrays_are_missing():
    cleaner = DataCleaner()
    result = cleaner.clean({
        "title": "Youth Leadership Fellowship",
        "description": """
        A fellowship for emerging African leaders.

        Eligibility:
        - Applicants must be between 18 and 30 years old.
        - Applicants must live in Africa.

        Benefits:
        - Leadership training
        - Mentorship from experienced professionals

        How to apply:
        1. Complete the online form.
        2. Upload a CV.
        """,
        "source": "Official programme",
    })

    assert result["requirements"] == [
        "Applicants must be between 18 and 30 years old.",
        "Applicants must live in Africa.",
    ]
    assert result["benefits"] == [
        "Leadership training",
        "Mentorship from experienced professionals",
    ]
    assert result["applicationProcess"] == [
        "Complete the online form.",
        "Upload a CV.",
    ]


def test_clean_falls_back_to_labeled_sections_when_supplied_arrays_are_only_noise():
    cleaner = DataCleaner()
    result = cleaner.clean({
        "title": "Youth Enterprise Programme",
        "description": """
        A practical programme for young business owners.

        Eligibility:
        - Applicants must own a small business.

        Benefits:
        - Practical business training.

        How to apply:
        1. Complete the official form.
        """,
        "requirements": ["Click here to apply"],
        "benefits": ["Subscribe to our newsletter"],
        "applicationProcess": ["Apply now"],
        "source": "Official programme",
    })

    assert result["requirements"] == ["Applicants must own a small business."]
    assert result["benefits"] == ["Practical business training."]
    assert result["applicationProcess"] == ["Complete the official form."]
