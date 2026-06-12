import { MaskingStyle } from "./types";

/**
 * Masks a name based on the selected masking style.
 */
export function maskName(name: string, style: MaskingStyle, index: number): string {
  if (!name) return "";
  if (style === MaskingStyle.NONE) return name;
  if (style === MaskingStyle.ANONYMOUS) return `학생 ${index + 1}`;
  
  const len = name.length;
  if (len <= 1) return name;
  
  if (len === 2) {
    if (style === MaskingStyle.MIDDLE_ASTERISK || style === MaskingStyle.LAST_ASTERISK) {
      return name[0] + "*";
    }
    if (style === MaskingStyle.OO) {
      return name[0] + "O";
    }
  }
  
  // 3 or more characters
  if (style === MaskingStyle.MIDDLE_ASTERISK) {
    const middleLen = len - 2;
    return name[0] + "*".repeat(middleLen) + name[len - 1];
  }
  if (style === MaskingStyle.LAST_ASTERISK) {
    return name.slice(0, -1) + "*";
  }
  if (style === MaskingStyle.OO) {
    return name[0] + "O".repeat(len - 1);
  }
  
  return name;
}

/**
 * Replaces occurrences of the original name in a text comment with the masked name.
 * It also replaces first name mentions (e.g. "지운" from "강지운") to ensure complete privacy.
 */
export function applyNameMaskingToText(
  text: string, 
  originalName: string, 
  maskedName: string,
  style: MaskingStyle = MaskingStyle.NONE
): string {
  if (!text || !originalName || originalName === maskedName) return text;
  
  // 1. Escape and replace the full name first
  const escapedName = originalName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(escapedName, "g");
  let replacedText = text.replace(regex, maskedName);

  // 2. Also locate and replace the first name parts (to catch cases where AI references by first name)
  if (originalName.length >= 2 && style !== MaskingStyle.NONE) {
    const firstName = originalName.length === 2 ? originalName.slice(-1) : originalName.slice(-2);
    
    const maskedFirstName = style === MaskingStyle.ANONYMOUS 
      ? maskedName 
      : (originalName.length === 2 ? maskedName.slice(-1) : maskedName.slice(-2));

    const escapedFirstName = firstName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const firstRegex = new RegExp(escapedFirstName, "g");
    replacedText = replacedText.replace(firstRegex, maskedFirstName);
  }
  
  return replacedText;
}

/**
 * Simple parser to translate parsed spreadsheet paste text into students structure.
 * Excel copies are normally separated by tab (\t) on columns, and newline (\r\n or \n) on rows.
 */
export function parsePastedTable(text: string): {
  success: boolean;
  message: string;
  data?: {
    rowHeaders: string[];
    students: Array<{ number: string; name: string; grades: string[] }>;
  };
} {
  const cleanText = text.trim();
  if (!cleanText) {
    return { success: false, message: "붙여넣은 내용이 없습니다." };
  }

  const lines = cleanText.split(/\r?\n/);
  if (lines.length < 1) {
    return { success: false, message: "올바른 줄바꿈이 포함된 텍스트가 아닙니다." };
  }

  // Parse header
  const firstLine = lines[0];
  const headers = firstLine.split("\t").map(h => h.trim());
  
  // Find where Number and Name columns likely are
  let numberIndex = -1;
  let nameIndex = -1;
  
  // Common terms for number and name in Korean
  const numberKeywords = ["번호", "학번", "학년-반/번호", "순번", "id", "no", "no."];
  const nameKeywords = ["성명", "이름", "학생명", "성함", "name"];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (numberIndex === -1 && numberKeywords.some(kw => h.includes(kw))) {
      numberIndex = i;
    }
    if (nameIndex === -1 && nameKeywords.some(kw => h.includes(kw))) {
      nameIndex = i;
    }
  }

  // If we couldn't find keywords, assume column 0 is number, column 1 is name
  if (numberIndex === -1) numberIndex = 0;
  if (nameIndex === -1) nameIndex = 1;

  // Identify grade/evaluation columns (columns that are not number and not name)
  const gradeColIndices: number[] = [];
  const evalHeaders: string[] = [];
  
  for (let i = 0; i < headers.length; i++) {
    if (i !== numberIndex && i !== nameIndex && headers[i] !== "") {
      gradeColIndices.push(i);
      evalHeaders.push(headers[i]);
    }
  }

  const parsedStudents: any[] = [];
  
  // Iterate from line 1 onward
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split("\t");
    // Ensure row has at least columns up to name
    const minCols = Math.max(numberIndex, nameIndex) + 1;
    if (row.length < minCols || (row.length === 1 && row[0] === "")) {
      continue;
    }

    const sNumber = (row[numberIndex] || `${i}`).trim();
    const sName = (row[nameIndex] || "").trim();

    if (!sName) {
      continue; // Skip headless or nameless rows
    }

    // Extract grades based on evaluation column indices
    const sGrades = gradeColIndices.map(colIdx => {
      const val = row[colIdx];
      return val ? val.trim() : "";
    });

    parsedStudents.push({
      number: sNumber,
      name: sName,
      grades: sGrades,
    });
  }

  if (parsedStudents.length === 0) {
    return { success: false, message: "학생 정보를 한 명도 인식하지 못했습니다. 형식을 확인해주세요." };
  }

  return {
    success: true,
    message: `${parsedStudents.length}명의 학생을 성공적으로 인식했습니다.`,
    data: {
      rowHeaders: evalHeaders,
      students: parsedStudents,
    },
  };
}

/**
 * Counts the size of a Korean string in school record format bytes.
 * Often, official guidelines calculate:
 * - English/numbers/special: 1 byte
 * - Korean characters: 3 bytes or sometimes 2 bytes (depending on the system, e.g. NEIS counts 1 Korean hangul as 3 bytes).
 * Let's calculate standard UTF-8 bytes and also Korean Hangul as 3-byte, and provide a clear counter.
 */
export function getByteLength(str: string): number {
  if (!str) return 0;
  let byteLen = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    if (char <= 0x7f) {
      byteLen += 1;
    } else {
      byteLen += 3; // Standard NEIS (나이스) byte count uses 3 bytes for Hangul!
    }
  }
  return byteLen;
}
