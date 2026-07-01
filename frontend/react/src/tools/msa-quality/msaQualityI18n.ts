const REASON_LABELS: Record<string, string> = {
  high_gap: "高 GAP 比例",
  low_conservation: "低保守性",
  high_entropy: "高熵值"
};

export function problemReasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

export function recommendationZh(text: string): string {
  if (text.startsWith("Gap ratio is high")) return "整体 GAP 比例较高；建议尝试 MAFFT L-INS-i 或 E-INS-i，并检查序列同源性。";
  if (text.startsWith("Average identity is low")) return "平均成对序列一致性较低；请确认所有序列是否同源，必要时按同源序列组分组分析。";
  if (text.startsWith("Problematic regions were detected")) return "检测到问题区域；可考虑使用 trimAl 或 Gblocks 修剪低质量比对列。";
  if (text.startsWith("Some sequences have high gap fractions")) return text.replace("Some sequences have high gap fractions; inspect or remove:", "部分序列的 GAP 比例较高，建议检查或移除：");
  if (text.startsWith("Alignment quality metrics look acceptable")) return "当前比对质量指标总体可接受，可继续用于下游分析。";
  return text;
}
