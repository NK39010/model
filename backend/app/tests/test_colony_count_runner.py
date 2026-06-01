# Verifies image-based colony counting and result file generation.
from __future__ import annotations

import base64
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

from app.api.handlers import _content_type
from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.colony_count.runner import ColonyCountRunner
from app.tools.errors import ToolInputError
from app.tools.registry import list_tools


class ColonyCountRunnerTest(unittest.TestCase):
    def test_missing_image_is_rejected(self) -> None:
        runner = ColonyCountRunner()
        with self.assertRaises(ToolInputError):
            runner.validate_input({})

    def test_non_image_base64_is_rejected(self) -> None:
        runner = ColonyCountRunner()
        payload = {
            "image_data_url": "data:image/png;base64," + base64.b64encode(b"not an image").decode("ascii"),
        }
        with self.assertRaises(ToolInputError):
            runner.validate_input(payload)

    def test_parameter_bounds_are_validated(self) -> None:
        runner = ColonyCountRunner()
        payload = _payload(_image_data_url([(40, 40, 10)]), min_area=0)
        with self.assertRaises(ToolInputError):
            runner.validate_input(payload)

    def test_counts_three_synthetic_colonies(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = ColonyCountRunner()
            payload = _payload(
                _image_data_url([
                    (40, 45, 10),
                    (92, 48, 12),
                    (66, 98, 11),
                ])
            )

            result = runner.run(payload, Path(tempdir))

            self.assertEqual(result["colony_count"], 3)
            self.assertEqual(result["raw_region_count"], 3)
            self.assertEqual(result["split_region_count"], 0)
            self.assertTrue((Path(tempdir) / "result.json").exists())
            self.assertTrue((Path(tempdir) / "annotated.png").exists())
            self.assertTrue((Path(tempdir) / "mask.png").exists())
            self.assertTrue((Path(tempdir) / "colonies.csv").exists())

    def test_splits_touching_synthetic_colonies(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = ColonyCountRunner()
            payload = _payload(
                _image_data_url([
                    (58, 70, 24),
                    (88, 70, 24),
                ]),
                min_area=50,
                split_sensitivity=0.35,
            )

            result = runner.run(payload, Path(tempdir))

            self.assertEqual(result["colony_count"], 2)
            self.assertEqual(result["raw_region_count"], 1)
            self.assertEqual(result["split_region_count"], 1)
            self.assertEqual({colony["source"] for colony in result["colonies"]}, {"split"})

    def test_ignores_bright_objects_outside_detected_plate(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = ColonyCountRunner()
            payload = _payload(_plate_image_data_url())

            result = runner.run(payload, Path(tempdir))

            self.assertTrue(result["plate"]["detected"])
            self.assertEqual(result["colony_count"], 1)
            self.assertLess(result["colonies"][0]["center_x"], 80)
            self.assertLess(result["colonies"][0]["center_y"], 80)

    def test_target_color_mode_counts_matching_colony_color(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = ColonyCountRunner()
            payload = _payload(
                _colored_image_data_url(),
                color_mode="target",
                target_color="#f1e7c8",
                color_tolerance=45,
                min_area=40,
            )

            result = runner.run(payload, Path(tempdir))

            self.assertEqual(result["colony_count"], 2)

    def test_sample_color_mode_accepts_sample_image(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = ColonyCountRunner()
            payload = _payload(
                _colored_image_data_url(),
                color_mode="sample",
                sample_image_data_url=_sample_color_data_url(),
                color_tolerance=45,
                min_area=40,
            )

            result = runner.run(payload, Path(tempdir))

            self.assertEqual(result["colony_count"], 2)

    def test_job_service_runs_registered_colony_count_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "colony_count",
                _payload(_image_data_url([(45, 45, 12), (90, 90, 12)])),
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertEqual(job.result["colony_count"], 2)

    def test_colony_count_is_listed_and_png_content_type_is_supported(self) -> None:
        self.assertIn("colony_count", {tool["name"] for tool in list_tools()})
        self.assertEqual(_content_type("annotated.png"), "image/png")


def _payload(image_data_url: str, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "image_data_url": image_data_url,
        "min_area": 20,
        "max_area": 5000,
        "circularity_threshold": 0.2,
        "threshold_mode": "otsu",
        "invert": False,
        "split_touching": True,
        "split_sensitivity": 0.45,
        "edge_margin_ratio": 0.0,
    }
    payload.update(overrides)
    return payload


def _image_data_url(circles: list[tuple[int, int, int]]) -> str:
    image = Image.new("RGB", (140, 140), "black")
    draw = ImageDraw.Draw(image)
    for x, y, radius in circles:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill="white")

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _plate_image_data_url() -> str:
    image = Image.new("RGB", (160, 160), "black")
    draw = ImageDraw.Draw(image)
    draw.ellipse((15, 15, 145, 145), outline="white", width=4)
    draw.ellipse((70, 70, 86, 86), fill="white")
    draw.ellipse((143, 143, 155, 155), fill="white")

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _colored_image_data_url() -> str:
    image = Image.new("RGB", (140, 140), (86, 92, 80))
    draw = ImageDraw.Draw(image)
    draw.ellipse((8, 8, 132, 132), outline=(235, 230, 205), width=4)
    draw.ellipse((42, 48, 58, 64), fill=(241, 231, 200))
    draw.ellipse((82, 80, 100, 98), fill=(241, 231, 200))
    draw.rectangle((105, 45, 126, 60), fill=(20, 20, 20))

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _sample_color_data_url() -> str:
    image = Image.new("RGB", (24, 24), (241, 231, 200))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


if __name__ == "__main__":
    unittest.main()
