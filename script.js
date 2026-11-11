
const PROGRAM_MAP = {
  BSIT: "Bachelor of Science in Information Technology",
  BSCS: "Bachelor of Science in Computer Science",
  BSIS: "Bachelor of Science in Information Systems",
};

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read " + file.name));
    reader.readAsText(file);
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      values.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}

function parseCsv(text) {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter(line => line.trim() !== "");

  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] !== undefined ? values[i] : ""; });
    return row;
  });
}

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function toStudentId(value) {
  const v = clean(value);
  return /^\d+$/.test(v) ? parseInt(v, 10) : null;
}

function toProperCase(value) {
  return clean(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toUpperCode(value) {
  return clean(value).toUpperCase();
}

function toProgramName(code) {
  return PROGRAM_MAP[code] || code || null;
}

function toEmail(value) {
  return clean(value).toLowerCase();
}

function toDecimal(value) {
  const v = clean(value).replace(/,/g, "");
  if (v === "" || isNaN(Number(v))) return null;
  return Number(v);
}

function toGrade(value) {
  const v = clean(value);
  if (v === "") return null;
  const num = Number(v);
  if (!isNaN(num)) return num;
  return v.toUpperCase();
}

function toStatus(value) {
  return toProperCase(value);
}

function transform(sisRows, lmsRows, accRows) {
  function indexBy(rows) {
    const map = new Map();
    rows.forEach(row => {
      const id = toStudentId(row.student_id);
      if (id !== null && !map.has(id)) map.set(id, row);
    });
    return map;
  }

  const lmsById = indexBy(lmsRows);
  const accById = indexBy(accRows);

  const students = [];
  sisRows.forEach(row => {
    const studentId = toStudentId(row.student_id);
    if (studentId === null) return;

    const lmsRow = lmsById.get(studentId);
    const accRow = accById.get(studentId);

    students.push({
      studentId,
      studentName: toProperCase(row.student_name),
      program: toProgramName(toUpperCode(row.program_code)),
      emailAddress: toEmail(row.email),
      lms: lmsRow
        ? {
            courseCode: toUpperCode(lmsRow.course_code),
            finalGrade: toGrade(lmsRow.final_grade),
            completionStatus: toStatus(lmsRow.completion_status),
          }
        : null,
      accounting: accRow
        ? {
            outstandingBalance: toDecimal(accRow.account_balance),
            currency: toUpperCode(accRow.currency),
          }
        : null,
    });
  });

  return students;
}

const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = "hint" + (type ? " " + type : "");
}

function runEtl(sisText, lmsText, accText) {
  const sisRows = parseCsv(sisText);
  const lmsRows = parseCsv(lmsText);
  const accRows = parseCsv(accText);

  const result = transform(sisRows, lmsRows, accRows);
  const json = JSON.stringify(result, null, 4);
  outputEl.textContent = json;
  setStatus(
    `ETL complete: extracted ${sisRows.length} SIS, ${lmsRows.length} LMS, ${accRows.length} Accounting rows → ${result.length} integrated students.`,
    "ok"
  );
}

document.getElementById("runBtn").addEventListener("click", async () => {
  const sis = document.getElementById("sisFile").files[0];
  const lms = document.getElementById("lmsFile").files[0];
  const acc = document.getElementById("accFile").files[0];

  if (!sis || !lms || !acc) {
    setStatus("Please upload all three CSV files (SIS, LMS, Accounting) before running ETL.", "error");
    return;
  }
  try {
    const [sisText, lmsText, accText] = await Promise.all([readFile(sis), readFile(lms), readFile(acc)]);
    runEtl(sisText, lmsText, accText);
  } catch (err) {
    setStatus("Error: " + err.message, "error");
  }
});
