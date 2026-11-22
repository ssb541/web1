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


if __name__ == "__main__":
    unittest.main()
