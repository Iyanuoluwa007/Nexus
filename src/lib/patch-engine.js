// ─────────────────────────────────────────────
// Patch Engine
// Applies surgical find-and-replace patches
// to the original code without rewriting it
// ─────────────────────────────────────────────

/**
 * Apply an array of patches to source code.
 * Returns { code, applied, failed } — the patched code plus status of each patch.
 */
export function applyPatches(originalCode, patches = [], newModules = []) {
  let code = originalCode;
  const applied = [];
  const failed = [];

  for (const patch of patches) {
    try {
      const find = patch.find;
      if (!find || find.trim().length === 0) {
        failed.push({ ...patch, error: "Empty find string" });
        continue;
      }

      if (patch.type === "delete") {
        if (code.includes(find)) {
          code = code.replace(find, "");
          applied.push(patch);
        } else {
          // Try fuzzy match (trimmed whitespace)
          const fuzzyResult = fuzzyReplace(code, find, "");
          if (fuzzyResult !== null) {
            code = fuzzyResult;
            applied.push({ ...patch, _fuzzy: true });
          } else {
            failed.push({ ...patch, error: "Find string not found in code" });
          }
        }
      } else if (patch.type === "insert_before") {
        if (code.includes(find)) {
          code = code.replace(find, (patch.replace || "") + "\n" + find);
          applied.push(patch);
        } else {
          failed.push({ ...patch, error: "Anchor string not found" });
        }
      } else if (patch.type === "insert_after") {
        if (code.includes(find)) {
          code = code.replace(find, find + "\n" + (patch.replace || ""));
          applied.push(patch);
        } else {
          failed.push({ ...patch, error: "Anchor string not found" });
        }
      } else {
        // Default: replace
        if (code.includes(find)) {
          code = code.replace(find, patch.replace || "");
          applied.push(patch);
        } else {
          // Try fuzzy match
          const fuzzyResult = fuzzyReplace(code, find, patch.replace || "");
          if (fuzzyResult !== null) {
            code = fuzzyResult;
            applied.push({ ...patch, _fuzzy: true });
          } else {
            failed.push({ ...patch, error: "Find string not found in code (exact or fuzzy)" });
          }
        }
      }
    } catch (err) {
      failed.push({ ...patch, error: err.message });
    }
  }

  // Append new modules at the end of the file
  if (newModules && newModules.length > 0) {
    for (const mod of newModules) {
      if (mod.code && mod.code.trim().length > 0) {
        code = code.trimEnd() + "\n\n\n" + mod.code.trim() + "\n";
        applied.push({ id: `new_${mod.title}`, title: `Added: ${mod.title}`, type: "add", reason: mod.reason });
      }
    }
  }

  return { code, applied, failed };
}

/**
 * Fuzzy replace — tries matching with normalized whitespace.
 * Returns the modified code string or null if no match.
 */
function fuzzyReplace(code, find, replacement) {
  // Strategy 1: Trim each line and match
  const findLines = find.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (findLines.length === 0) return null;

  const codeLines = code.split("\n");

  // Find the first line match
  for (let i = 0; i < codeLines.length; i++) {
    if (codeLines[i].trim() === findLines[0]) {
      // Check if subsequent lines match
      let match = true;
      let matchEnd = i;
      let findIdx = 0;

      for (let j = i; j < codeLines.length && findIdx < findLines.length; j++) {
        const trimmed = codeLines[j].trim();
        if (trimmed.length === 0) continue; // skip blank lines in source
        if (trimmed === findLines[findIdx]) {
          findIdx++;
          matchEnd = j;
        } else {
          match = false;
          break;
        }
      }

      if (match && findIdx === findLines.length) {
        // Found a fuzzy match from line i to matchEnd
        const before = codeLines.slice(0, i);
        const after = codeLines.slice(matchEnd + 1);
        // Preserve the indentation of the first matched line
        const indent = codeLines[i].match(/^(\s*)/)?.[1] || "";
        const replacementLines = replacement.split("\n").map((l, idx) => {
          if (idx === 0) return indent + l.trimStart();
          return indent + l.trimStart(); // maintain indent level
        });
        return [...before, ...replacementLines, ...after].join("\n");
      }
    }
  }

  return null;
}

/**
 * Generate a simple unified diff-style view between original and patched code.
 */
export function generateDiffSummary(original, patched) {
  const origLines = original.split("\n");
  const patchLines = patched.split("\n");

  const stats = {
    linesAdded: 0,
    linesRemoved: 0,
    linesChanged: 0,
    totalOriginal: origLines.length,
    totalPatched: patchLines.length,
  };

  // Simple line-by-line comparison
  const maxLen = Math.max(origLines.length, patchLines.length);
  for (let i = 0; i < maxLen; i++) {
    const orig = origLines[i];
    const patch = patchLines[i];
    if (orig === undefined) stats.linesAdded++;
    else if (patch === undefined) stats.linesRemoved++;
    else if (orig !== patch) stats.linesChanged++;
  }

  return stats;
}
