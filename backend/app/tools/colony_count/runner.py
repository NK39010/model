# Counts colonies in plate images with explainable OpenCV segmentation.
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageOps
from skimage.feature import peak_local_max
from skimage.segmentation import watershed

from app.services.file_service import write_csv, write_json
from app.tools.base import ToolRunner
from app.tools.colony_count.parser import parse_colony_count_result
from app.tools.colony_count.schemas import ColonyCountInput


@dataclass(frozen=True)
class RegionMetrics:
    area: float
    circularity: float
    center_x: float
    center_y: float
    radius: float
    touches_edge: bool


@dataclass(frozen=True)
class PlateDetection:
    mask: np.ndarray
    center_x: float | None
    center_y: float | None
    radius: float | None


class ColonyCountRunner(ToolRunner):
    """Count colonies and split likely touching colonies with watershed."""

    name = "colony_count"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        ColonyCountInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = ColonyCountInput.from_payload(payload)
        image_rgb = _read_rgb_image(data.image_bytes)
        plate = _detect_plate(image_rgb, data.edge_margin_ratio)
        mask = _foreground_mask(image_rgb, data, plate.mask)
        colonies, raw_region_count, split_region_count = _count_colonies(mask, data)

        annotated = _annotated_image(image_rgb, colonies)
        mask_preview = _mask_preview(image_rgb, mask, plate)
        cv2.imwrite(str(workdir / "annotated.png"), cv2.cvtColor(annotated, cv2.COLOR_RGB2BGR))
        cv2.imwrite(str(workdir / "mask.png"), cv2.cvtColor(mask_preview, cv2.COLOR_RGB2BGR))
        cv2.imwrite(str(workdir / "binary_mask.png"), mask)
        write_csv(workdir / "colonies.csv", colonies)

        result = {
            "colony_count": len(colonies),
            "raw_region_count": raw_region_count,
            "split_region_count": split_region_count,
            "parameters": data.parameters(),
            "plate": {
                "center_x": None if plate.center_x is None else round(plate.center_x, 2),
                "center_y": None if plate.center_y is None else round(plate.center_y, 2),
                "radius": None if plate.radius is None else round(plate.radius, 2),
                "detected": plate.radius is not None,
            },
            "colonies": colonies,
            "files": {
                "annotated_image": "annotated.png",
                "mask_image": "mask.png",
                "binary_mask_image": "binary_mask.png",
                "csv": "colonies.csv",
                "json": "result.json",
            },
        }
        write_json(workdir / "result.json", result)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_colony_count_result(workdir / "result.json")


def _read_rgb_image(image_bytes: bytes) -> np.ndarray:
    with Image.open(BytesIO(image_bytes)) as image:
        image = ImageOps.exif_transpose(image)
        return np.array(image.convert("RGB"))


def _detect_plate(image_rgb: np.ndarray, edge_margin_ratio: float) -> PlateDetection:
    height, width = image_rgb.shape[:2]
    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (9, 9), 1.5)
    min_dim = min(height, width)
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min_dim * 0.5,
        param1=80,
        param2=30,
        minRadius=int(min_dim * 0.25),
        maxRadius=int(min_dim * 0.55),
    )

    if circles is None:
        return PlateDetection(np.full((height, width), 255, dtype=np.uint8), None, None, None)

    candidates = np.round(circles[0]).astype(int)
    center_image = np.array([width / 2, height / 2])
    best = max(
        candidates,
        key=lambda circle: (
            circle[2],
            -float(np.linalg.norm(np.array([circle[0], circle[1]]) - center_image)),
        ),
    )
    center_x, center_y, radius = int(best[0]), int(best[1]), int(best[2])
    rim_guard_ratio = max(edge_margin_ratio, 0.08)
    analysis_radius = max(1, int(radius * (1 - rim_guard_ratio)))
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.circle(mask, (center_x, center_y), analysis_radius, 255, thickness=-1)
    return PlateDetection(mask, float(center_x), float(center_y), float(analysis_radius))


def _foreground_mask(image_rgb: np.ndarray, data: ColonyCountInput, plate_mask: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    contrast = _color_guided_contrast(image_rgb, enhanced, data)
    contrast = cv2.bitwise_and(contrast, plate_mask)

    if data.threshold_mode == "adaptive":
        mask = cv2.adaptiveThreshold(
            contrast,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            51,
            -12,
        )
    else:
        _, mask = cv2.threshold(contrast, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

    kernel = np.ones((3, 3), dtype=np.uint8)
    mask = cv2.bitwise_and(mask, plate_mask)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    return cv2.bitwise_and(mask, plate_mask)


def _local_contrast(gray: np.ndarray, invert: bool) -> np.ndarray:
    min_dim = min(gray.shape[:2])
    sigma = max(12, min_dim / 24)
    background = cv2.GaussianBlur(gray, (0, 0), sigmaX=sigma, sigmaY=sigma)
    if invert:
        contrast = cv2.subtract(background, gray)
    else:
        contrast = cv2.subtract(gray, background)
    return cv2.normalize(contrast, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)


def _color_guided_contrast(image_rgb: np.ndarray, gray: np.ndarray, data: ColonyCountInput) -> np.ndarray:
    if data.color_mode == "auto":
        return _local_contrast(gray, data.invert)

    target_color = data.target_color
    if data.color_mode == "sample" and data.sample_image_bytes is not None:
        sample_rgb = _read_rgb_image(data.sample_image_bytes)
        target_color = _sample_target_color(sample_rgb, data.invert)

    if target_color is None:
        return _local_contrast(gray, data.invert)

    lab_image = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    target = np.uint8([[list(target_color)]])
    lab_target = cv2.cvtColor(target, cv2.COLOR_RGB2LAB).astype(np.float32)[0, 0]
    distance = np.linalg.norm(lab_image - lab_target, axis=2)
    similarity = np.clip(1 - (distance / max(data.color_tolerance, 1.0)), 0, 1)
    color_score = (similarity * 255).astype(np.uint8)

    contrast = _local_contrast(gray, data.invert).astype(np.float32)
    combined = np.maximum(color_score.astype(np.float32), contrast * 0.35)
    return np.clip(combined, 0, 255).astype(np.uint8)


def _sample_target_color(sample_rgb: np.ndarray, invert: bool) -> tuple[int, int, int]:
    gray = cv2.cvtColor(sample_rgb, cv2.COLOR_RGB2GRAY)
    if invert:
        threshold = np.percentile(gray, 20)
        selected = sample_rgb[gray <= threshold]
    else:
        threshold = np.percentile(gray, 80)
        selected = sample_rgb[gray >= threshold]
    if selected.size == 0:
        selected = sample_rgb.reshape(-1, 3)
    median = np.median(selected.reshape(-1, 3), axis=0)
    return (int(median[0]), int(median[1]), int(median[2]))


def _count_colonies(mask: np.ndarray, data: ColonyCountInput) -> tuple[list[dict[str, Any]], int, int]:
    colonies: list[dict[str, Any]] = []
    raw_region_count = 0
    split_region_count = 0
    component_count, labels = cv2.connectedComponents((mask > 0).astype(np.uint8), connectivity=8)

    for label in range(1, component_count):
        region_mask = np.where(labels == label, 255, 0).astype(np.uint8)
        contours, _ = cv2.findContours(region_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        metrics = _region_metrics(region_mask, contour, data.edge_margin_ratio)
        if not _passes_region_filter(metrics, data):
            continue

        raw_region_count += 1
        split_colonies = _split_touching_region(region_mask, metrics, data) if data.split_touching else []
        if len(split_colonies) >= 2:
            split_region_count += 1
            colonies.extend(split_colonies)
        else:
            colonies.append(_colony_record(metrics, "single"))

    colonies.sort(key=lambda item: (item["center_y"], item["center_x"]))
    for index, colony in enumerate(colonies, start=1):
        colony["id"] = f"colony_{index:04d}"
    return colonies, raw_region_count, split_region_count


def _region_metrics(region_mask: np.ndarray, contour: np.ndarray, edge_margin_ratio: float) -> RegionMetrics:
    area = float(cv2.countNonZero(region_mask))
    perimeter = float(cv2.arcLength(contour, True))
    circularity = 0.0 if perimeter == 0 else float(4 * np.pi * area / (perimeter * perimeter))
    moments = cv2.moments(region_mask, binaryImage=True)
    if moments["m00"]:
        center_x = float(moments["m10"] / moments["m00"])
        center_y = float(moments["m01"] / moments["m00"])
    else:
        center_x = center_y = 0.0
    radius = float(np.sqrt(area / np.pi))

    height, width = region_mask.shape
    margin = int(min(height, width) * edge_margin_ratio)
    x, y, w, h = cv2.boundingRect(contour)
    touches_edge = x <= margin or y <= margin or x + w >= width - margin or y + h >= height - margin
    return RegionMetrics(area, circularity, center_x, center_y, radius, touches_edge)


def _passes_region_filter(metrics: RegionMetrics, data: ColonyCountInput) -> bool:
    return (
        data.min_area <= metrics.area <= data.max_area
        and metrics.circularity >= data.circularity_threshold
        and not metrics.touches_edge
    )


def _split_touching_region(
    region_mask: np.ndarray,
    metrics: RegionMetrics,
    data: ColonyCountInput,
) -> list[dict[str, Any]]:
    if not _looks_touching(region_mask, metrics, data):
        return []

    binary = (region_mask > 0).astype(np.uint8)
    distance = cv2.distanceTransform(binary, cv2.DIST_L2, 5)
    if distance.max() <= 0:
        return []

    min_distance = max(3, int(metrics.radius * 0.65), int(np.sqrt(data.min_area / np.pi) * 1.4))
    coordinates = peak_local_max(
        distance,
        min_distance=min_distance,
        threshold_abs=float(distance.max() * data.split_sensitivity),
        labels=binary,
        exclude_border=False,
    )
    if len(coordinates) < 2:
        return []

    markers = np.zeros(region_mask.shape, dtype=np.int32)
    for marker_id, (row, col) in enumerate(coordinates, start=1):
        markers[row, col] = marker_id

    labels = watershed(-distance, markers, mask=binary)
    split_colonies: list[dict[str, Any]] = []
    for label in range(1, labels.max() + 1):
        part_mask = np.where(labels == label, 255, 0).astype(np.uint8)
        contours, _ = cv2.findContours(part_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        part_metrics = _region_metrics(part_mask, contour, data.edge_margin_ratio)
        if _passes_split_filter(part_metrics, data):
            split_colonies.append(_colony_record(part_metrics, "split"))

    return split_colonies if len(split_colonies) >= 2 else []


def _looks_touching(region_mask: np.ndarray, metrics: RegionMetrics, data: ColonyCountInput) -> bool:
    if metrics.area < data.min_area * 1.8:
        return False
    binary = (region_mask > 0).astype(np.uint8)
    distance = cv2.distanceTransform(binary, cv2.DIST_L2, 5)
    if distance.max() <= 0:
        return False
    coordinates = peak_local_max(
        distance,
        min_distance=max(3, int(metrics.radius * 0.45)),
        threshold_abs=float(distance.max() * max(0.25, data.split_sensitivity)),
        labels=binary,
        exclude_border=False,
    )
    return len(coordinates) >= 2 or metrics.area > data.max_area * 0.45 or metrics.circularity < data.circularity_threshold + 0.2


def _passes_split_filter(metrics: RegionMetrics, data: ColonyCountInput) -> bool:
    return (
        data.min_area <= metrics.area <= data.max_area
        and metrics.circularity >= max(0.1, data.circularity_threshold * 0.6)
        and not metrics.touches_edge
    )


def _colony_record(metrics: RegionMetrics, source: str) -> dict[str, Any]:
    return {
        "id": "",
        "center_x": round(metrics.center_x, 2),
        "center_y": round(metrics.center_y, 2),
        "area": round(metrics.area, 2),
        "radius": round(metrics.radius, 2),
        "source": source,
    }


def _annotated_image(image_rgb: np.ndarray, colonies: list[dict[str, Any]]) -> np.ndarray:
    annotated = image_rgb.copy()
    for colony in colonies:
        center = (int(round(colony["center_x"])), int(round(colony["center_y"])))
        radius = max(4, int(round(colony["radius"])))
        color = (230, 76, 60) if colony["source"] == "split" else (25, 111, 99)
        cv2.circle(annotated, center, radius, color, 2)
        cv2.putText(
            annotated,
            colony["id"].removeprefix("colony_"),
            (center[0] + 4, center[1] - 4),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.42,
            color,
            1,
            cv2.LINE_AA,
        )
    return annotated


def _mask_preview(image_rgb: np.ndarray, mask: np.ndarray, plate: PlateDetection) -> np.ndarray:
    preview = image_rgb.copy()
    highlight = np.zeros_like(preview)
    highlight[:, :, 0] = 255
    highlight[:, :, 1] = 80
    preview = np.where(mask[:, :, None] > 0, cv2.addWeighted(preview, 0.45, highlight, 0.55, 0), preview)

    visible_mask = cv2.dilate(mask, np.ones((5, 5), dtype=np.uint8), iterations=1)
    contours, _ = cv2.findContours(visible_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(preview, contours, -1, (255, 255, 0), 2)

    if plate.radius is not None and plate.center_x is not None and plate.center_y is not None:
        cv2.circle(
            preview,
            (int(round(plate.center_x)), int(round(plate.center_y))),
            int(round(plate.radius)),
            (255, 210, 0),
            3,
        )
    return preview
