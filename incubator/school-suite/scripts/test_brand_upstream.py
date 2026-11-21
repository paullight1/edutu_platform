import tempfile
import unittest
from pathlib import Path
from brand_upstream import BrandError, brand_engine


class BrandOverlayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "public").mkdir()
        (self.root / ".env.example").write_text("APP_NAME=Skuul\nAPP_ENV=local\nAPP_CURRENCY=NGN\n")

    def make(self, path, content):
        file = self.root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content)
        return file

    def run_brand(self, engine="skuul"):
        return brand_engine(self.root, engine, "Evolve Academy", "EA", "#e67436", "NGN", "Africa/Lagos")

    def test_skuul_branding_is_reproducible(self):
        login = self.make("resources/views/auth/login.blade.php",
                          '<x-partials.authentication-card description="Sign in to continue to Skuul.">')
        self.run_brand()
        one = login.read_text()
        self.assertIn("config(", one)
        self.assertNotIn("continue to Skuul", one)
        self.assertIn('APP_NAME="Evolve Academy"', (self.root / ".env").read_text())
        self.assertIn("EA</text>", (self.root / "public/brand/school-logo.svg").read_text())
        self.run_brand()
        self.assertEqual(login.read_text(), one)

    def test_gegok12_logo_and_favicon(self):
        logo = self.make("resources/views/layouts/partials/logo.blade.php",
                         "<img src=\"{{ asset('/images/gego_k12.png') }}\" alt=\"GegoK12 Logo\">")
        icon = self.make("resources/views/layouts/partials/favicon.blade.php", "<link rel='icon' href='old.png'>")
        self.run_brand("gegok12")
        self.assertIn("brand/school-logo.svg", logo.read_text())
        self.assertIn("brand/school-logo.svg", icon.read_text())
        self.assertIn("TIMEZONE=Africa/Lagos", (self.root / ".env").read_text())

    def test_refuses_production(self):
        (self.root / ".env").write_text("APP_ENV=production\n")
        self.make("resources/views/auth/login.blade.php",
                  'description="Sign in to continue to Skuul."')
        with self.assertRaises(BrandError):
            self.run_brand()
        self.assertFalse((self.root / "public/brand/school-logo.svg").exists())

    def test_refuses_unexpected_layout_and_bad_color(self):
        self.make("resources/views/auth/login.blade.php", "Completely different version")
        with self.assertRaises(BrandError):
            self.run_brand()
        with self.assertRaises(BrandError):
            brand_engine(self.root, "skuul", "Evolve", "E", "red; background:url(x)",
                         "NGN", "Africa/Lagos")


if __name__ == "__main__":
    unittest.main()
