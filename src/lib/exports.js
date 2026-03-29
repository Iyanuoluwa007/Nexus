// ─────────────────────────────────────────────
// Export Utilities
// Download refactored code, tests, docs, reports
// ─────────────────────────────────────────────

export function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  // Fallback
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); return true; }
  catch { return false; }
  finally { document.body.removeChild(ta); }
}

export function detectLanguageExt(lang) {
  const map = {
    python: "py", javascript: "js", typescript: "ts", java: "java",
    go: "go", rust: "rs", ruby: "rb", cpp: "cpp", c: "c",
    csharp: "cs", php: "php", swift: "swift", kotlin: "kt",
  };
  return map[lang] || "txt";
}

export function generateMarkdownReport(state) {
  const { results, issues, metrics, config, projectName, language, mode, totalTokensUsed, startTime, endTime } = state;
  const elapsed = startTime && endTime ? ((endTime - startTime) / 1000).toFixed(1) : "N/A";
  const rev = results.reviewer;
  const ref = results.refactor;
  const sec = results.security;
  const opt = results.optimizer;
  const tst = results.tester;
  const mig = results.migrator;
  const doc = results.documenter;

  let md = `# NEXUS REFACTOR — Analysis Report\n\n`;
  md += `**Project**: ${projectName || "Unnamed"}\n`;
  md += `**Language**: ${language || "auto-detected"}\n`;
  md += `**Mode**: ${mode}\n`;
  md += `**Duration**: ${elapsed}s\n`;
  md += `**Tokens Used**: ${totalTokensUsed.toLocaleString()}\n`;
  md += `**Generated**: ${new Date().toISOString()}\n\n`;

  // Grade
  if (rev) {
    md += `## Final Grade: ${rev.grade} ${rev.approved ? "(APPROVED)" : "(NOT APPROVED)"}\n`;
    md += `Confidence: ${rev.confidence}%\n\n`;
  }

  // Metrics
  if (metrics) {
    md += `## Code Metrics\n\n`;
    md += `| Metric | Value |\n|--------|-------|\n`;
    md += `| Cyclomatic Complexity | ${metrics.cyclomatic_complexity} |\n`;
    md += `| Maintainability Index | ${metrics.maintainability_index}/100 |\n`;
    md += `| Lines of Code | ${metrics.lines_of_code} |\n`;
    md += `| Code Duplication | ${metrics.code_duplication_pct}% |\n`;
    md += `| Coupling Score | ${metrics.coupling_score}/100 |\n`;
    md += `| Cohesion Score | ${metrics.cohesion_score}/100 |\n`;
    md += `| Tech Debt | ${metrics.tech_debt_hours} hours |\n`;
    md += `| Test Coverage | ${metrics.test_coverage}% |\n\n`;
  }

  // Before/After
  if (ref?.before_after) {
    md += `## Transformation Impact\n\n`;
    md += `| Metric | Before | After | Change |\n|--------|--------|-------|--------|\n`;
    const ba = ref.before_after;
    const cDelta = ba.complexity_before - ba.complexity_after;
    const mDelta = ba.maintainability_after - ba.maintainability_before;
    md += `| Complexity | ${ba.complexity_before} | ${ba.complexity_after} | -${cDelta} (${Math.round(cDelta/ba.complexity_before*100)}% reduction) |\n`;
    md += `| Maintainability | ${ba.maintainability_before} | ${ba.maintainability_after} | +${mDelta} (${Math.round(mDelta/ba.maintainability_before*100)}% improvement) |\n\n`;
  }

  // Issues
  if (issues.length > 0) {
    md += `## Issues Found (${issues.length})\n\n`;
    const sevOrder = ["critical", "high", "medium", "low"];
    for (const sev of sevOrder) {
      const sevIssues = issues.filter(i => i.severity === sev);
      if (sevIssues.length === 0) continue;
      md += `### ${sev.toUpperCase()} (${sevIssues.length})\n\n`;
      for (const iss of sevIssues) {
        md += `- **${iss.title}**${iss.line ? ` (line ${iss.line})` : ""}\n`;
        md += `  ${iss.description}\n`;
        if (iss.cwe) md += `  CWE: ${iss.cwe}\n`;
        if (iss.fix_suggestion || iss.fix) md += `  Fix: ${iss.fix_suggestion || iss.fix}\n`;
        md += `\n`;
      }
    }
  }

  // Security
  if (sec) {
    md += `## Security Analysis\n\nRisk Score: **${sec.risk_score}/100**\n\n${sec.summary || ""}\n\n`;
    if (sec.secrets_found?.length) {
      md += `### Secrets Found\n\n`;
      for (const s of sec.secrets_found) md += `- ${s.type} (line ${s.line})\n`;
      md += `\n`;
    }
  }

  // Performance
  if (opt) {
    md += `## Performance Analysis\n\nPerformance Score: **${opt.performance_score}/100**\n\n${opt.summary || ""}\n\n`;
  }

  // Patterns Applied
  if (ref?.patterns_applied?.length) {
    md += `## Design Patterns Applied\n\n`;
    for (const p of ref.patterns_applied) md += `- ${p}\n`;
    md += `\n`;
  }

  // Changes
  if (ref?.changes?.length) {
    md += `## Refactoring Changes\n\n`;
    for (const c of ref.changes) md += `- **[${c.type}]** ${c.description}\n`;
    md += `\n`;
  }

  // Tests
  if (tst) {
    md += `## Test Suite\n\n`;
    md += `- Total Tests: ${tst.test_count}\n`;
    md += `- Estimated Coverage: ${tst.coverage_estimate}%\n`;
    if (tst.categories) {
      md += `- Categories: ${Object.entries(tst.categories).map(([k, v]) => `${k}(${v})`).join(", ")}\n`;
    }
    if (tst.frameworks_used) md += `- Frameworks: ${tst.frameworks_used.join(", ")}\n`;
    md += `\n`;
  }

  // Migration
  if (mig?.migrations?.length) {
    md += `## Migration Roadmap\n\nModernization Score: **${mig.modernization_score}/100**\n\n`;
    for (const m of mig.migrations) {
      md += `### ${m.title}\n`;
      md += `${m.from} → ${m.to} | Effort: ${m.effort_hours}h | Impact: ${m.impact}\n\n`;
      if (m.steps?.length) {
        for (let i = 0; i < m.steps.length; i++) md += `${i + 1}. ${m.steps[i]}\n`;
        md += `\n`;
      }
    }
  }

  // Review Scores
  if (rev?.categories) {
    md += `## Review Scores\n\n`;
    md += `| Category | Score | Notes |\n|----------|-------|-------|\n`;
    for (const [cat, info] of Object.entries(rev.categories)) {
      md += `| ${cat.replace("_", " ")} | ${info.score}/10 | ${info.notes} |\n`;
    }
    md += `\n`;
  }

  // Recommendations
  if (rev?.recommendations?.length) {
    md += `## Recommendations\n\n`;
    for (const r of rev.recommendations) md += `- ${r}\n`;
    md += `\n`;
  }

  // Final Assessment
  if (rev?.final_assessment) {
    md += `## Final Assessment\n\n${rev.final_assessment}\n\n`;
  }

  md += `---\n*Generated by NEXUS REFACTOR v3.0 | Oke Iyanuoluwa Enoch*\n`;
  return md;
}
