import type { GgtreePayload } from "./ggtreeTypes";

export const GGTREE_STYLE_SPEC_VERSION = 1;
export const CSS_PIXELS_PER_INCH = 96;
export const GGPLOT_MM_TO_CSS_PX = 96 / 25.4;

export interface EffectiveGgtreeStyle {
  width: number;
  height: number;
  tipFontSize: number;
  supportMode: GgtreePayload["support_mode"];
}

export function resolveEffectiveGgtreeStyle(payload: GgtreePayload, tipCount: number): EffectiveGgtreeStyle {
  if (!payload.auto_size) {
    return {
      width: payload.width,
      height: payload.height,
      tipFontSize: payload.tip_font_size,
      supportMode: payload.support_mode
    };
  }
  if (tipCount <= 30) {
    return {
      width: Math.max(payload.width, 9),
      height: Math.max(payload.height, 6),
      tipFontSize: payload.tip_font_size,
      supportMode: payload.support_mode
    };
  }
  if (tipCount <= 120) {
    return {
      width: Math.max(payload.width, 11),
      height: Math.max(payload.height, Math.min(18, 4 + tipCount * 0.08)),
      tipFontSize: payload.tip_font_size,
      supportMode: payload.support_mode
    };
  }
  return {
    width: Math.max(payload.width, 13),
    height: Math.max(payload.height, Math.min(36, 5 + tipCount * 0.055)),
    tipFontSize: payload.tip_font_size,
    supportMode: payload.support_mode
  };
}

export function ggtreeSizeToPreviewPixels(value: number): number {
  return value * GGPLOT_MM_TO_CSS_PX;
}

export function ggtreeCanvasToPreviewPixels(value: number): number {
  return value * CSS_PIXELS_PER_INCH;
}

export function buildGgtreeStyleSpec(payload: GgtreePayload, tipCount: number) {
  const effective = resolveEffectiveGgtreeStyle(payload, tipCount);
  const { newick: _newick, ...style } = payload;
  const labelOverrides = Object.fromEntries(Object.entries(style.label_overrides).map(([tipName, override]) => {
    const { translate_x: _translateX, translate_y: _translateY, ...ggtreeOverride } = override as typeof override & { translate_x?: number; translate_y?: number };
    return [tipName, ggtreeOverride];
  }));
  return {
    style_spec_version: GGTREE_STYLE_SPEC_VERSION,
    units: {
      text_size: "ggplot2_mm",
      line_width: "ggplot2_mm",
      plot_size: "inch",
      tip_offset: "tree_coordinate"
    },
    ...style,
    label_overrides: labelOverrides,
    width: effective.width,
    height: effective.height,
    tip_font_size: effective.tipFontSize,
    support_mode: effective.supportMode
  };
}
