type Report = {
  title: string;
  subtitle: string;
  generated: string;
  filename: string;
  headings: string[];
  rows: string[][];
  totals: string[];
};

// Render with browser fonts so Khmer shaping is preserved in the PDF.
export async function downloadLoanListPdf(report: Report) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"), import("jspdf"),
  ]);
  await document.fonts.ready;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "absolute", left: "-12000px", top: "0", width: "1120px",
    background: "#ffffff", color: "#203448", padding: "8px",
    fontFamily: `var(--font-khmer), Arial, sans-serif`, fontSize: "13px",
    lineHeight: "1.65", boxSizing: "border-box",
  });
  const reportHeader = document.createElement("div");
  host.append(reportHeader);
  const addText = (text: string, size: string, weight = "400") => {
    const element = document.createElement("div");
    element.textContent = text;
    Object.assign(element.style, { fontSize: size, fontWeight: weight, marginBottom: "4px", overflowWrap: "anywhere" });
    reportHeader.append(element);
  };
  addText(`KamJey · ${report.title}`, "18px", "700");
  addText(report.subtitle, "12px");
  addText(report.generated, "11px");
  const table = document.createElement("table");
  Object.assign(table.style, { width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginTop: "8px" });
  const columns = document.createElement("colgroup");
  // Give borrower names and Khmer statuses more room than short dates and amounts.
  for (const width of [14, 8, 14, 10, 9, 10, 9, 10, 8, 8]) {
    const column = document.createElement("col");
    column.style.width = `${width}%`;
    columns.append(column);
  }
  table.append(columns);
  const makeRow = (values: string[], heading = false, total = false) => {
    const row = document.createElement("tr");
    values.forEach((value, index) => {
      const cell = document.createElement(heading ? "th" : "td");
      cell.textContent = value;
      Object.assign(cell.style, {
        padding: "5px 6px", borderBottom: "1px solid #dce4ec", verticalAlign: "top",
        textAlign: index >= 3 && index <= 7 ? "right" : "left",
        fontWeight: heading || total ? "700" : "400", whiteSpace: "pre-wrap",
        overflowWrap: "anywhere", background: heading || total ? "#edf3f7" : "#ffffff",
        fontSize: "12px", lineHeight: "1.55",
      });
      row.append(cell);
    });
    return row;
  };
  const head = document.createElement("thead");
  head.append(makeRow(report.headings, true));
  const body = document.createElement("tbody");
  table.append(head, body);
  host.append(table);
  document.body.append(host);
  try {
    await document.fonts.load(`400 13px ${getComputedStyle(host).fontFamily}`);
    await document.fonts.load(`700 13px ${getComputedStyle(host).fontFamily}`);
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    const pages: HTMLTableRowElement[][] = [];
    let pageRows: HTMLTableRowElement[] = [];
    const loanRows = report.rows.map((row) => makeRow(row));
    const totalRow = makeRow(report.totals, false, true);
    // Keep the final loan and totals together, avoiding a totals-only page.
    const groups = loanRows.slice(0, -1).map((row) => [row]);
    groups.push([...loanRows.slice(-1), totalRow]);
    const pageHeight = 185 * 1120 / 277;
    for (const group of groups) {
      body.append(...group);
      if (host.offsetHeight > pageHeight && pageRows.length) {
        group.forEach((row) => row.remove());
        pages.push(pageRows);
        reportHeader.style.display = "none";
        body.replaceChildren(...group);
        pageRows = [];
      }
      pageRows.push(...group);
    }
    if (pageRows.length) pages.push(pageRows);
    for (let index = 0; index < pages.length; index++) {
      reportHeader.style.display = index === 0 ? "block" : "none";
      body.replaceChildren(...pages[index]);
      const canvas = await html2canvas(host, { scale: 2, backgroundColor: "#ffffff", logging: false });
      if (index) pdf.addPage();
      const width = Math.min(277, 185 * canvas.width / canvas.height);
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, 8, width, canvas.height * width / canvas.width, undefined, "FAST");
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 132);
      pdf.text(`${index + 1} / ${pages.length}`, 287, 203, { align: "right" });
      canvas.width = 0;
      canvas.height = 0;
    }
    pdf.save(report.filename);
  } finally {
    host.remove();
  }
}
