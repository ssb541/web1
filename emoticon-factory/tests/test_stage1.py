import unittest
from emoticon_factory.design import build_svg, validate_svg
from emoticon_factory.collect import parse_titles
from emoticon_factory.analyze import tokens


class T(unittest.TestCase):
    def test_svg_ids(self):
        n_ids, n_shapes = validate_svg(build_svg(["#9AD0F5"]))
        self.assertGreaterEqual(n_ids, n_shapes)

    def test_parse_html(self):
        r = parse_titles('<a href="/x/1">말랑 곰돌이</a><img alt="귀여운 냥"><a href="/y">a</a>', 10)
        self.assertEqual([t for t, _ in r], ["말랑 곰돌이", "귀여운 냥"])

    def test_parse_json(self):
        self.assertEqual(parse_titles('{"items":[{"title":"도형 친구"}]}', 5)[0][0], "도형 친구")

    def test_tokens(self):
        self.assertIn("곰돌이", tokens("말랑한 곰돌이의 하루"))

    def test_adjust_and_trend(self):
        from emoticon_factory.review import adjust, trend_fit
        from emoticon_factory.produce import DEFAULT_PARAMS
        p, notes = adjust(DEFAULT_PARAMS, {"가독성": (50, ["cov_low", "face_small"]), "트렌드 적합": (50, ["phrase_missing:힘내!"])})
        self.assertGreater(p["char_r"], DEFAULT_PARAMS["char_r"])
        self.assertIn("힘내!", p["extra_phrases"])
        self.assertEqual(trend_fit({"phrases": [("사랑해", 1)]}, DEFAULT_PARAMS)[0], 100)

    def test_psd_header(self):
        import struct, tempfile, pathlib
        from PIL import Image
        from emoticon_factory.produce import write_psd
        d = pathlib.Path(tempfile.mkdtemp())
        Image.new("RGBA", (20, 10), (255, 0, 0, 255)).save(d / "layer_000.png")
        Image.new("RGBA", (20, 10), (255, 0, 0, 255)).save(d / "sheet_full.png")
        write_psd(d, [("a", "")], d / "x.psd", 20, 10)
        b = (d / "x.psd").read_bytes()
        self.assertEqual(b[:4], b"8BPS")
        self.assertEqual(struct.unpack(">IIHH", b[14:26]), (10, 20, 8, 3))


if __name__ == "__main__":
    unittest.main()
