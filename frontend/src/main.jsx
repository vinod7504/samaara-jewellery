import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { jsPDF } from "jspdf";
import "./styles.css";

const catalogItems = [
  { name: "18kt diamond pendant (own diamond)", grossWeight: 12.43, lessWeight: 4.6, wastagePercent: 10, goldRate: 11320, makingCharge: 5481, otherCharge: 1550, otherLabel: "Laser soldering and rhodium" },
  { name: "18kt round coin inbetween chain", grossWeight: 18.35, lessWeight: 13.8, wastagePercent: 11, goldRate: 11320, makingCharge: 3185 },
  { name: "18kt design ring", grossWeight: 4.19, wastagePercent: 9, goldRate: 11320, makingCharge: 2800 },
  { name: "18kt diamond ring", grossWeight: 3.39, wastagePercent: 9, goldRate: 11320, makingCharge: 2800 },
  { name: "18kt plain gold ring 1", grossWeight: 2.2, wastagePercent: 9, goldRate: 11320, makingCharge: 2200 },
  { name: "18kt plain gold ring 2", grossWeight: 0.2, wastagePercent: 9, goldRate: 11320, makingCharge: 2200 },
  { name: "Hollow coral string", otherCharge: 11200, otherLabel: "Fixed item amount" },
  { name: "Green amethyst strand", otherCharge: 15200, otherLabel: "Fixed item amount" },
  { name: "Silver brooch", otherCharge: 7860, otherLabel: "Fixed item amount" }
];

const today = new Date().toISOString().slice(0, 10);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const num = value => Number.parseFloat(value) || 0;
const money = (value, decimals = 2) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}`;
const plainMoney = (value, decimals = 1) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
const apiBaseUrl = window.location.port === "5173" ? "http://localhost:3001" : "";
const apiUrl = path => `${apiBaseUrl}${path}`;

function financialYearFor(dateValue) {
  const [year, month] = String(dateValue || today).split("-").map(Number);
  const startYear = month >= 4 ? year : year - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

function fallbackInvoiceNumber(dateValue) {
  const date = new Date(`${dateValue || today}T00:00:00`);
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = String(date.getDate()).padStart(2, "0");
  return `SAM/${financialYearFor(dateValue)}/${month}-${day}-1`;
}

function blankItem(rates) {
  return {
    id: uid(),
    name: "Other jewellery item",
    karat: "18",
    grossWeight: "",
    lessWeight: "",
    wastagePercent: rates.defaultWastage,
    wastageSplitPercent: "",
    goldRate: rates.goldRate,
    labourStyle: "fixed",
    makingCharge: "",
    diamondType1: "",
    diamondWeight1: "",
    diamondRate1: rates.diamondRate,
    diamondType2: "",
    diamondWeight2: "",
    diamondRate2: "",
    diamondType3: "",
    diamondWeight3: "",
    diamondRate3: "",
    otherCharge: "",
    otherLabel: "",
    karigar: "",
    stage: "",
    estimatedCost: "",
    actualCost: ""
  };
}

function calculateItem(item) {
  const grossWeight = num(item.grossWeight);
  const lessWeight = num(item.lessWeight);
  const netWeight = Math.max(grossWeight - lessWeight, 0);
  const wastagePercent = num(item.wastagePercent);
  const wastageSplitPercent = num(item.wastageSplitPercent);
  const wastageWeight = netWeight * (wastagePercent + wastageSplitPercent) / 100;
  const chargeableGoldWeight = netWeight + wastageWeight;
  const goldRate = num(item.goldRate);
  const goldAmount = chargeableGoldWeight * goldRate;
  const diamonds = [1, 2, 3].map(index => ({
    type: item[`diamondType${index}`] || "",
    weight: num(item[`diamondWeight${index}`]),
    rate: num(item[`diamondRate${index}`])
  })).filter(stone => stone.type || stone.weight || stone.rate);
  const diamondAmount = diamonds.reduce((sum, stone) => sum + stone.weight * stone.rate, 0);
  const labourInput = num(item.makingCharge);
  const makingCharge = item.labourStyle === "withStone" ? labourInput * grossWeight : item.labourStyle === "onlyGold" ? labourInput * chargeableGoldWeight : labourInput;
  const otherCharge = num(item.otherCharge);
  return { ...item, grossWeight, lessWeight, netWeight, wastagePercent, wastageSplitPercent, wastageWeight, chargeableGoldWeight, goldRate, goldAmount, diamonds, diamondAmount, labourInput, makingCharge, otherCharge, total: goldAmount + diamondAmount + makingCharge + otherCharge };
}

function calculateTotals(items, deductions) {
  const calculatedItems = items.map(calculateItem);
  const subtotal = calculatedItems.reduce((sum, item) => sum + item.total, 0);
  const cgst = subtotal * 0.015;
  const sgst = subtotal * 0.015;
  const oldGoldDeduction = num(deductions.oldGoldWeight) * num(deductions.oldGoldRate);
  const grandTotal = Math.round(subtotal + cgst + sgst - oldGoldDeduction);
  return { items: calculatedItems, subtotal, cgst, sgst, oldGoldDeduction, roundOff: grandTotal - (subtotal + cgst + sgst - oldGoldDeduction), grandTotal };
}

function numberToWordsIndian(amount) {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const twoDigits = n => n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`;
  const threeDigits = n => `${n >= 100 ? ones[Math.floor(n / 100)] + " hundred" + (n % 100 ? " and " : "") : ""}${twoDigits(n % 100)}`;
  if (!amount) return "zero only";
  const parts = [];
  const crore = Math.floor(amount / 10000000);
  amount %= 10000000;
  const lakh = Math.floor(amount / 100000);
  amount %= 100000;
  const thousand = Math.floor(amount / 1000);
  amount %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} thousand`);
  if (amount) parts.push(threeDigits(amount));
  return `${parts.join(" ")} only`;
}

function drawInvoicePage(doc) {
  doc.setFillColor(255, 252, 244);
  doc.rect(0, 0, 612, 792, "F");
  doc.setDrawColor(218, 197, 157);
  doc.setLineWidth(0.6);
  doc.rect(52, 58, 508, 604);
  doc.setDrawColor(230, 214, 183);
  doc.line(52, 203, 560, 203);
  doc.line(52, 500, 560, 500);
}

function drawInvoiceHeader(doc, form) {
  const left = 59;
  const text = (value, x, lineY, options = {}) => doc.text(String(value), x, lineY, options);
  const dateValue = form.invoiceDate ? new Date(`${form.invoiceDate}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, "-") : "-";

  drawSamaaraLogo(doc);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(45, 36, 24);
  text("GSTN No: 29AAPPU7885C1ZT", left, 70);
  text("Tax Invoice", 284, 70);
  text("Ph: 9886677434", 431, 70);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  text(`Date: ${dateValue}`, 438, 139);
  text(`Invoice No: ${form.invoiceNo || "sample invoices"}`, left, 149);
  text("Prop: Thirtha Uthappa", 262, 149);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(45, 36, 24);
  text("Old Aiport Road, Bangalore - 560 017", 246, 159);
  text(`Name: ${form.customerName || "-"}`, left, 170);
  text(`Address: ${form.customerAddress || ""}`, left, 180);
  text("GSTN:", left, 191);
  text(form.customerTax || "PAN", 329, 191);
}

function drawInvoiceTableHeader(doc) {
  const text = (value, x, lineY, options = {}) => doc.text(String(value), x, lineY, options);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(45, 36, 24);
  text("Sl.no", 109, 201);
  text("HSN", 339, 201);
  text("Qty", 380, 201);
  text("Rate", 425, 201);
  text("Amount (Rs.)", 464, 201);
  doc.setFont("helvetica", "normal");
}

function drawSamaaraLogo(doc) {
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(214, 78, 184, 64, 3, 3, "F");
  doc.setTextColor(166, 132, 73);
  doc.setFont("times", "normal");
  doc.setFontSize(30);
  doc.text("Samaara", 306, 113, { align: "center", charSpace: 6 });
  doc.setFontSize(6);
  doc.text("precious jewellery. personalized.", 306, 124, { align: "center", charSpace: 1.5 });
  doc.setTextColor(45, 36, 24);
  doc.setFont("helvetica", "normal");
}

function buildPdf({ form, deductions, totals }) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const descX = 136, qtyX = 395, rateX = 446, amountX = 503, line = 10.45;
  const firstBodyY = 222;
  const continuationBodyY = 222;
  const bodyBottomY = 640;
  let y = firstBodyY;
  const text = (value, x, lineY, options = {}) => doc.text(String(value), x, lineY, options);
  const amount = value => plainMoney(value, 1);

  drawInvoicePage(doc);
  drawInvoiceHeader(doc, form);
  drawInvoiceTableHeader(doc);

  for (const [index, item] of totals.items.entries()) {
    if (y > bodyBottomY) {
      doc.addPage();
      drawInvoicePage(doc);
      drawInvoiceHeader(doc, form);
      drawInvoiceTableHeader(doc);
      y = continuationBodyY;
    }
    text(index + 1, 115, y);
    text(item.name || "Jewellery item", descX, y, { maxWidth: 210 });
    if (item.grossWeight) text(item.grossWeight.toFixed(3), qtyX, y, { align: "right" });
    y += line;
    if (item.lessWeight) {
      text("Less : old / centre / detachable weight", descX, y);
      text(item.lessWeight.toFixed(3), qtyX, y, { align: "right" });
      y += line;
    }
    if (item.netWeight && item.lessWeight) {
      text("Net weight", descX, y);
      text(item.netWeight.toFixed(3), qtyX, y, { align: "right" });
      y += line;
    }
    if (item.wastageWeight) {
      text(item.wastageSplitPercent ? `Add : Wastage (${item.wastagePercent}+${item.wastageSplitPercent}%)` : "Add : Wastage", descX, y);
      text(item.wastageWeight.toFixed(3), qtyX, y, { align: "right" });
      y += line;
    }
    if (item.goldAmount) {
      text(item.chargeableGoldWeight.toFixed(3), qtyX, y, { align: "right" });
      text(amount(item.goldRate), rateX, y, { align: "right" });
      text(amount(item.goldAmount), amountX, y, { align: "right" });
      y += line;
    }
    item.diamonds.forEach(stone => {
      text(stone.type || "Diamond / stone value", descX, y);
      if (stone.weight) text(stone.weight.toFixed(3), qtyX, y, { align: "right" });
      if (stone.rate) text(amount(stone.rate), rateX, y, { align: "right" });
      text(amount(stone.weight * stone.rate), amountX, y, { align: "right" });
      y += line;
    });
    if (item.otherCharge) {
      text(item.otherLabel || "Other charges", descX, y);
      text(amount(item.otherCharge), amountX, y, { align: "right" });
      y += line;
    }
    if (item.makingCharge) {
      text(item.labourStyle === "fixed" ? "MC" : `MC @ ${amount(item.labourInput)}`, descX, y);
      text(amount(item.makingCharge), amountX, y, { align: "right" });
      y += line;
    }
    y += line;
  }

  if (y > 560) {
    doc.addPage();
    drawInvoicePage(doc);
    drawInvoiceHeader(doc, form);
    drawInvoiceTableHeader(doc);
    y = continuationBodyY;
  }
  y += 10;
  const summary = [["TOTAL", "", totals.subtotal], ["CGST", "1.50%", totals.cgst], ["SGST", "1.50%", totals.sgst], ["IGST", "", 0]];
  if (totals.oldGoldDeduction) summary.push([`Less : Old gold given ${deductions.oldGold24k ? "(converted to 24kt)" : ""}`, "", -totals.oldGoldDeduction]);
  summary.push(["Round Off", "", totals.roundOff]);
  summary.forEach(([label, rate, value]) => {
    text(label, label.length > 12 ? 300 : 375, y);
    if (rate) text(rate, 423, y);
    text(amount(value), amountX, y, { align: "right" });
    y += line;
  });
  doc.setFont("helvetica", "bold");
  text("Grand Total", 366, y + 11);
  text(plainMoney(totals.grandTotal, 0), amountX, y + 11, { align: "right" });
  doc.setFont("helvetica", "normal");
  text(numberToWordsIndian(totals.grandTotal).replace(/^\w/, c => c.toUpperCase()), 100, y + 16, { maxWidth: 400 });
  y += 52;
  text("This is a system generated Invoice and does not require signature", 306, Math.max(y, 620), { align: "center" });
  return doc;
}

function generatePdf(data) {
  const doc = buildPdf(data);
  doc.save(`${data.form.invoiceNo || "SAMAARA-invoice"}.pdf`.replace(/[\\/:*?"<>|]/g, "-"));
}

function pdfDataUri(data) {
  return buildPdf(data).output("datauristring");
}

function Field({ label, children, className = "" }) {
  return <label className={`block ${className}`}><span className="text-sm font-medium">{label}</span>{children}</label>;
}

function TextInput(props) {
  return <input {...props} value={props.value ?? ""} className={`field ${props.className || ""}`} />;
}

function ItemCard({ item, index, total, updateItem, removeItem, rates }) {
  const set = (key, value) => updateItem(item.id, key, value);
  return (
    <article className="rounded-md border border-[#eadabe] bg-[#fffaf0] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-semibold">Item {index + 1}</h3>
        <button type="button" className="rounded border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50" onClick={removeItem}>Remove</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Field label="Particulars" className="xl:col-span-2"><TextInput value={item.name} onChange={e => set("name", e.target.value)} /></Field>
        <Field label="Karat"><select className="field" value={item.karat} onChange={e => {
          const karat = e.target.value;
          const rate = { 18: rates.gold18Rate, 22: rates.gold22Rate, 24: rates.gold24Rate }[karat];
          set("karat", karat);
          if (rate) set("goldRate", rate);
        }}><option value="18">18kt</option><option value="22">22kt</option><option value="24">24kt</option><option value="custom">Custom</option></select></Field>
        <Field label="Gross Weight (g)"><TextInput type="number" step="0.001" value={item.grossWeight} onChange={e => set("grossWeight", e.target.value)} /></Field>
        <Field label="Less Weight (g)"><TextInput type="number" step="0.001" value={item.lessWeight} onChange={e => set("lessWeight", e.target.value)} /></Field>
        <Field label="Wastage 1 %"><TextInput type="number" step="0.001" value={item.wastagePercent} onChange={e => set("wastagePercent", e.target.value)} /></Field>
        <Field label="Wastage 2 %"><TextInput type="number" step="0.001" value={item.wastageSplitPercent} onChange={e => set("wastageSplitPercent", e.target.value)} /></Field>
        <Field label="Gold Rate"><TextInput type="number" step="0.01" value={item.goldRate} onChange={e => set("goldRate", e.target.value)} /></Field>
        <Field label="Labour Style"><select className="field" value={item.labourStyle} onChange={e => set("labourStyle", e.target.value)}><option value="fixed">Fixed Amount</option><option value="withStone">With Stone / g</option><option value="onlyGold">Only Gold / g</option></select></Field>
        <Field label="Labour Rate / Amount"><TextInput type="number" step="0.01" value={item.makingCharge} onChange={e => set("makingCharge", e.target.value)} /></Field>
        {[1, 2, 3].map(number => (
          <Field key={number} label={`Diamond / Stone ${number}`} className="xl:col-span-2">
            <div className="grid grid-cols-[1fr_90px_100px] gap-2">
              <TextInput placeholder="Type" value={item[`diamondType${number}`]} onChange={e => set(`diamondType${number}`, e.target.value)} />
              <TextInput type="number" step="0.001" placeholder="ct" value={item[`diamondWeight${number}`]} onChange={e => set(`diamondWeight${number}`, e.target.value)} />
              <TextInput type="number" step="0.01" placeholder="rate" value={item[`diamondRate${number}`]} onChange={e => set(`diamondRate${number}`, e.target.value)} />
            </div>
          </Field>
        ))}
        <Field label="Other Charges"><TextInput type="number" step="0.01" value={item.otherCharge} onChange={e => set("otherCharge", e.target.value)} /></Field>
        <Field label="Other Charge Label" className="xl:col-span-2"><TextInput placeholder="Laser soldering, Pearls, Meena..." value={item.otherLabel} onChange={e => set("otherLabel", e.target.value)} /></Field>
        <Field label="Karigar / Vendor"><TextInput value={item.karigar} onChange={e => set("karigar", e.target.value)} /></Field>
        <Field label="Production Stage"><select className="field" value={item.stage} onChange={e => set("stage", e.target.value)}><option value="">Not set</option><option>CAD</option><option>Casting</option><option>Setting</option><option>Polish</option><option>QC</option><option>Delivered</option></select></Field>
        <Field label="Estimated Cost"><TextInput type="number" step="0.01" value={item.estimatedCost} onChange={e => set("estimatedCost", e.target.value)} /></Field>
        <Field label="Actual Cost"><TextInput type="number" step="0.01" value={item.actualCost} onChange={e => set("actualCost", e.target.value)} /></Field>
        <div className="rounded border border-[#e8d7b8] bg-white px-3 py-2 xl:col-span-2">
          <div className="text-xs uppercase tracking-wide text-muted">Item Total</div>
          <div className="text-lg font-semibold">{money(total)}</div>
        </div>
      </div>
    </article>
  );
}

function App() {
  const [form, setForm] = useState({ invoiceNo: fallbackInvoiceNumber(today), invoiceDate: today, customerTax: "", customerAddress: "" });
  const [rates, setRates] = useState({ goldRate: 11320, gold18Rate: 11320, gold22Rate: 13835, gold24Rate: 14650, diamondRate: 58500, defaultWastage: 10 });
  const [deductions, setDeductions] = useState({ oldGoldWeight: 0, oldGoldRate: 0, oldGold24k: true });
  const [items, setItems] = useState([{ ...blankItem({ goldRate: 11320, diamondRate: 58500, defaultWastage: 10 }), ...catalogItems[0], id: uid() }]);
  const [catalogChoice, setCatalogChoice] = useState("0");
  const [customerMatches, setCustomerMatches] = useState([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [invoiceHistory, setInvoiceHistory] = useState([]);
  const [saveStatus, setSaveStatus] = useState("");
  const [dashboardOpen, setDashboardOpen] = useState(window.location.pathname === "/dashboard");
  const [dashboardFilters, setDashboardFilters] = useState({ name: "", month: "", year: "" });
  const [dashboardRows, setDashboardRows] = useState([]);
  const [dashboardStatus, setDashboardStatus] = useState("");
  const totals = useMemo(() => calculateTotals(items, deductions), [items, deductions]);

  const setFormValue = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const setRateValue = (key, value) => setRates(current => ({ ...current, [key]: value }));
  const setDeductionValue = (key, value) => setDeductions(current => ({ ...current, [key]: value }));
  const updateItem = (id, key, value) => setItems(current => current.map(item => item.id === id ? { ...item, [key]: value } : item));
  const catalogToItem = index => {
    const source = catalogItems[index];
    return { ...blankItem(rates), ...source, id: uid(), goldRate: rates.goldRate || source.goldRate, diamondType1: source.diamondWeight ? "Diamond / stone value" : "", diamondWeight1: source.diamondWeight || "", diamondRate1: source.diamondWeight ? rates.diamondRate || source.diamondRate : rates.diamondRate };
  };

  useEffect(() => {
    let cancelled = false;
    async function loadNextInvoiceNumber() {
      setForm(current => ({ ...current, invoiceNo: fallbackInvoiceNumber(form.invoiceDate) }));
      try {
        const response = await fetch(apiUrl(`/api/invoices/next-number?date=${encodeURIComponent(form.invoiceDate)}`));
        const result = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && result.invoiceNo) {
          setForm(current => ({ ...current, invoiceNo: result.invoiceNo }));
        }
      } catch {
        if (!cancelled) setForm(current => ({ ...current, invoiceNo: fallbackInvoiceNumber(form.invoiceDate) }));
      }
    }
    loadNextInvoiceNumber();
    return () => {
      cancelled = true;
    };
  }, [form.invoiceDate]);

  useEffect(() => {
    if (dashboardOpen) loadDashboardHistory();
  }, []);

  const addSelectedItem = () => {
    if (!catalogChoice) return;
    setItems(current => [...current, catalogChoice === "other" ? blankItem(rates) : catalogToItem(Number(catalogChoice))]);
  };

  const payload = () => ({
    invoiceNo: form.invoiceNo.trim(),
    invoiceDate: form.invoiceDate,
    customer: { name: form.customerName.trim(), panCard: form.customerTax.trim().toUpperCase(), address: form.customerAddress.trim() },
    rates,
    deductions,
    items: totals.items,
    totals: { subtotal: totals.subtotal, cgst: totals.cgst, sgst: totals.sgst, oldGoldDeduction: totals.oldGoldDeduction, roundOff: totals.roundOff, grandTotal: totals.grandTotal }
  });

  const loadCustomerByPan = async panCard => {
    if (!panCard) return;
    try {
      const response = await fetch(apiUrl(`/api/customers/${encodeURIComponent(panCard)}`));
      if (!response.ok) return;
      const customer = await response.json();
      setForm(current => ({ ...current, customerName: customer.name || current.customerName, customerTax: customer.panCard || current.customerTax, customerAddress: customer.address || "" }));
      setInvoiceHistory(customer.invoices || []);
    } catch {
      setInvoiceHistory([]);
    }
  };

  const searchCustomers = async query => {
    const searchText = String(query || "").trim();
    if (!searchText) {
      setCustomerMatches([]);
      setShowCustomerSuggestions(false);
      return;
    }
    try {
      const response = await fetch(apiUrl(`/api/customers/search?q=${encodeURIComponent(searchText)}`));
      const matches = response.ok ? await response.json() : [];
      setCustomerMatches(matches);
      setShowCustomerSuggestions(matches.length > 0);
    } catch {
      setCustomerMatches([]);
      setShowCustomerSuggestions(false);
    }
  };

  const selectCustomer = customer => {
    setForm(current => ({
      ...current,
      customerName: customer.name || "",
      customerTax: customer.panCard || "",
      customerAddress: customer.address || ""
    }));
    setShowCustomerSuggestions(false);
    loadCustomerByPan(customer.panCard);
  };

  const loadDashboardHistory = async () => {
    setDashboardStatus("Loading invoice history...");
    const params = new URLSearchParams();
    if (dashboardFilters.name.trim()) params.set("name", dashboardFilters.name.trim());
    if (dashboardFilters.month) params.set("month", dashboardFilters.month);
    if (dashboardFilters.year.trim()) params.set("year", dashboardFilters.year.trim());
    try {
      const response = await fetch(apiUrl(`/api/invoices?${params.toString()}`));
      const result = await response.json().catch(() => []);
      if (!response.ok) throw new Error(result.error || "Could not load dashboard history.");
      setDashboardRows(result);
      setDashboardStatus(`${result.length} invoice(s) found.`);
    } catch (error) {
      setDashboardRows([]);
      setDashboardStatus(error.message);
    }
  };

  const openDashboard = () => {
    setDashboardOpen(true);
    window.history.pushState({}, "", "/dashboard");
    setTimeout(loadDashboardHistory, 0);
  };

  const closeDashboard = () => {
    setDashboardOpen(false);
    window.history.pushState({}, "", "/");
  };

  const downloadInvoice = async () => {
    setSaveStatus("Saving invoice...");
    const invoice = payload();
    if (!invoice.customer.panCard) return setSaveStatus("PAN card number is required before saving invoice.");
    try {
      const pdfForm = { ...form, invoiceNo: form.invoiceNo || fallbackInvoiceNumber(form.invoiceDate) };
      const pdfBase64 = pdfDataUri({ form: pdfForm, deductions, totals });
      const response = await fetch(apiUrl("/api/invoices"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...invoice, invoiceNo: pdfForm.invoiceNo, pdfBase64 })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Failed to save invoice.");
      const savedInvoiceNo = result.invoice?.invoiceNo || form.invoiceNo;
      const savedPdfForm = { ...form, invoiceNo: savedInvoiceNo };
      setForm(current => ({ ...current, invoiceNo: savedInvoiceNo }));
      await loadCustomerByPan(invoice.customer.panCard);
      generatePdf({ form: savedPdfForm, deductions, totals });
      setSaveStatus(`Invoice saved. File: ${result.invoice?.pdfPath || "backend/invoices"}`);
      if (dashboardOpen) loadDashboardHistory();
    } catch (error) {
      setSaveStatus(error.message);
    }
  };

  const navbar = (
    <header className="mb-6 flex flex-col gap-4 border-b border-[#e8d7b8] pb-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <img className="h-16 w-16 rounded-full border border-[#e1c793] bg-white object-cover" src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTM0nHMBQmLUOCOlPoB-Q4TNEUFR3ca9KGyhyauVc8GMA&s" alt="SAMAARA Jewellery" />
        <div><h1 className="text-2xl font-semibold tracking-wide sm:text-3xl">SAMAARA Jewellery</h1><p className="text-sm text-muted">Invoice builder for gold, diamond, wastage, making charges, GST, and old gold deduction</p></div>
      </div>
      <nav className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button className={dashboardOpen ? "btn-primary" : "btn-secondary"} type="button" onClick={openDashboard}>Customer Dashboard</button>
        <div className="rounded-md border border-[#e8d7b8] bg-white/70 px-4 py-3 text-sm"><div className="font-semibold">SAM Jewellers</div><div>GSTN: 29AAPPU7885C1ZT</div><div>Ph: 9886677434</div></div>
      </nav>
    </header>
  );

  const dashboardPage = (
    <section className="rounded-md border border-[#e8d7b8] bg-white/85 p-5 shadow-sm">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold">Customer Dashboard</h2>
        <button className="btn-secondary" type="button" onClick={closeDashboard}>Close Dashboard</button>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_200px_auto]">
        <Field label="Customer Name">
          <TextInput
            placeholder="Filter by name"
            value={dashboardFilters.name}
            onChange={e => setDashboardFilters(current => ({ ...current, name: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") loadDashboardHistory(); }}
          />
        </Field>
        <Field label="Month">
          <select className="field" value={dashboardFilters.month} onChange={e => setDashboardFilters(current => ({ ...current, month: e.target.value }))}>
            <option value="">All months</option>
            {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
          </select>
        </Field>
        <Field label="Year">
          <TextInput
            type="number"
            min="2000"
            max="2100"
            placeholder="2026"
            value={dashboardFilters.year}
            onChange={e => setDashboardFilters(current => ({ ...current, year: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") loadDashboardHistory(); }}
          />
        </Field>
        <div className="flex items-end">
          <button className="btn-primary w-full" type="button" onClick={loadDashboardHistory}>Filter</button>
        </div>
      </div>
      <div className="mt-4 min-h-5 text-sm text-muted">{dashboardStatus}</div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {!dashboardRows.length ? (
          <div className="rounded-md border border-[#eadabe] bg-[#fffaf0] p-4 text-sm text-muted">No invoice history found.</div>
        ) : dashboardRows.map(invoice => (
          <article key={invoice.invoiceNo} className="rounded-md border border-[#eadabe] bg-[#fffaf0] p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-ink">{invoice.customerName || "-"}</h3>
                <p className="text-sm text-muted">{invoice.panCard || "-"}</p>
              </div>
              <div className="rounded border border-[#dcc59d] bg-white px-2 py-1 text-right text-sm font-semibold">{money(invoice.grandTotal || 0, 0)}</div>
            </div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Invoice No.</dt><dd className="font-medium text-ink">{invoice.invoiceNo || "-"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Date</dt><dd>{invoice.invoiceDate || "-"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Items</dt><dd>{invoice.itemCount || 0}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Address</dt><dd className="max-w-44 text-right">{invoice.customerAddress || "-"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">File</dt><dd className="max-w-44 text-right">{invoice.pdfPath || "-"}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );

  if (dashboardOpen) {
    return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{navbar}{dashboardPage}</main>;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {navbar}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <section className="rounded-md border border-[#e8d7b8] bg-white/80 p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Customer & Invoice</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Invoice No."><TextInput value={form.invoiceNo} readOnly /></Field>
              <Field label="Date"><TextInput type="date" value={form.invoiceDate} onChange={e => setFormValue("invoiceDate", e.target.value)} /></Field>
              <Field label="Customer Name" className="relative">
                <TextInput
                  value={form.customerName}
                  autoComplete="off"
                  onChange={e => {
                    setFormValue("customerName", e.target.value);
                    searchCustomers(e.target.value);
                  }}
                  onFocus={() => {
                    if (customerMatches.length) setShowCustomerSuggestions(true);
                    searchCustomers(form.customerName);
                  }}
                  onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 150)}
                />
                {showCustomerSuggestions && (
                  <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-[#dcc59d] bg-white shadow-lg">
                    {customerMatches.map(customer => (
                      <button
                        key={customer.panCard}
                        type="button"
                        className="block w-full border-b border-[#f1e3c9] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[#fff3d8]"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => selectCustomer(customer)}
                      >
                        <span className="block font-semibold text-ink">{customer.name}</span>
                        <span className="block text-xs text-muted">PAN: {customer.panCard}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <Field label="PAN"><TextInput value={form.customerTax} onChange={e => setFormValue("customerTax", e.target.value)} onBlur={e => loadCustomerByPan(e.target.value.trim().toUpperCase())} placeholder="PAN" /></Field>
              <Field label="Address" className="md:col-span-2 xl:col-span-4"><textarea rows="2" className="field resize-none" value={form.customerAddress} onChange={e => setFormValue("customerAddress", e.target.value)} placeholder="Customer address" /></Field>
            </div>
          </section>

          <section className="rounded-md border border-[#e8d7b8] bg-white/80 p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Items</h2>
            <div className="mb-4 rounded-md border border-[#eadabe] bg-[#fffaf0] p-3">
              <Field label="Select SAMAARA Item"><select className="field" value={catalogChoice} onChange={e => setCatalogChoice(e.target.value)}><option value="">Choose item</option><option value="other">Add other item</option>{catalogItems.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select></Field>
              <div className="mt-3 flex flex-wrap gap-2"><button className="btn-primary" type="button" onClick={addSelectedItem}>Add Selected Item</button><button className="btn-secondary" type="button" onClick={() => setItems([])}>Clear Items</button></div>
            </div>
            <div className="space-y-4">{items.map((item, index) => <ItemCard key={item.id} item={item} index={index} total={calculateItem(item).total} rates={rates} updateItem={updateItem} removeItem={() => setItems(current => current.filter(row => row.id !== item.id))} />)}</div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-md border border-[#e8d7b8] bg-white/80 p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Rates & Deductions</h2>
            <div className="grid gap-4">
              <Field label="Today Gold Rate (per g)"><TextInput type="number" step="0.01" value={rates.goldRate} onChange={e => setRateValue("goldRate", e.target.value)} /></Field>
              <div className="grid grid-cols-3 gap-3"><Field label="18kt Rate"><TextInput type="number" step="0.01" value={rates.gold18Rate} onChange={e => setRateValue("gold18Rate", e.target.value)} /></Field><Field label="22kt Rate"><TextInput type="number" step="0.01" value={rates.gold22Rate} onChange={e => setRateValue("gold22Rate", e.target.value)} /></Field><Field label="24kt Rate"><TextInput type="number" step="0.01" value={rates.gold24Rate} onChange={e => setRateValue("gold24Rate", e.target.value)} /></Field></div>
              <Field label="Today Diamond Rate (per ct)"><TextInput type="number" step="0.01" value={rates.diamondRate} onChange={e => setRateValue("diamondRate", e.target.value)} /></Field>
              <Field label="Default Wastage Amount / %"><TextInput type="number" step="0.001" value={rates.defaultWastage} onChange={e => setRateValue("defaultWastage", e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Old Gold Weight (g)"><TextInput type="number" step="0.001" value={deductions.oldGoldWeight} onChange={e => setDeductionValue("oldGoldWeight", e.target.value)} /></Field><Field label="Old Gold Rate (g)"><TextInput type="number" step="0.01" value={deductions.oldGoldRate} onChange={e => setDeductionValue("oldGoldRate", e.target.value)} /></Field></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-gold" checked={deductions.oldGold24k} onChange={e => setDeductionValue("oldGold24k", e.target.checked)} />Old gold is converted to 24kt</label>
            </div>
          </section>

          <section className="rounded-md border border-[#e8d7b8] bg-white/80 p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Final Price</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Items Total</dt><dd>{money(totals.subtotal)}</dd></div><div className="flex justify-between"><dt>CGST 1.5%</dt><dd>{money(totals.cgst)}</dd></div><div className="flex justify-between"><dt>SGST 1.5%</dt><dd>{money(totals.sgst)}</dd></div><div className="flex justify-between"><dt>Old Gold Deduction</dt><dd>- {money(totals.oldGoldDeduction)}</dd></div><div className="flex justify-between"><dt>Round Off</dt><dd>{money(totals.roundOff)}</dd></div><div className="mt-3 border-t border-[#e8d7b8] pt-3 text-base font-semibold"><div className="flex justify-between"><dt>Grand Total</dt><dd>{money(totals.grandTotal, 0)}</dd></div></div>
            </dl>
            <button className="btn-primary mt-5 w-full" type="button" onClick={downloadInvoice}>Download Invoice PDF</button>
            <p className="mt-3 min-h-5 text-sm text-muted">{saveStatus}</p>
          </section>

          <section className="rounded-md border border-[#e8d7b8] bg-white/80 p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Customer Invoice History</h2>
            <div className="space-y-2 text-sm text-muted">{!invoiceHistory.length ? "Select an existing customer to view previous invoices." : invoiceHistory.map(invoice => <div key={invoice.invoiceNo} className="rounded border border-[#eadabe] bg-[#fffaf0] px-3 py-2"><div className="font-semibold text-ink">{invoice.invoiceNo}</div><div>{invoice.invoiceDate || "No date"} - {invoice.itemCount} item(s) - {money(invoice.grandTotal, 0)}</div></div>)}</div>
          </section>
        </aside>
      </section>

      {dashboardOpen && <section className="mt-5 rounded-md border border-[#e8d7b8] bg-white/85 p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><h2 className="text-lg font-semibold">Customer Dashboard</h2><button className="btn-secondary" type="button" onClick={closeDashboard}>Close Dashboard</button></div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px_auto]">
          <Field label="Customer Name"><TextInput placeholder="Filter by name" value={dashboardFilters.name} onChange={e => setDashboardFilters(current => ({ ...current, name: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") loadDashboardHistory(); }} /></Field>
          <Field label="Month"><select className="field" value={dashboardFilters.month} onChange={e => setDashboardFilters(current => ({ ...current, month: e.target.value }))}><option value="">All months</option>{["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></Field>
          <Field label="Year"><TextInput type="number" min="2000" max="2100" placeholder="2026" value={dashboardFilters.year} onChange={e => setDashboardFilters(current => ({ ...current, year: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") loadDashboardHistory(); }} /></Field>
          <div className="flex items-end"><button className="btn-primary w-full" type="button" onClick={loadDashboardHistory}>Filter</button></div>
        </div>
        <div className="mt-3 min-h-5 text-sm text-muted">{dashboardStatus}</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {!dashboardRows.length ? (
            <div className="rounded-md border border-[#eadabe] bg-[#fffaf0] p-4 text-sm text-muted">No invoice history found.</div>
          ) : dashboardRows.map(invoice => (
            <article key={invoice.invoiceNo} className="rounded-md border border-[#eadabe] bg-[#fffaf0] p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{invoice.customerName || "-"}</h3>
                  <p className="text-sm text-muted">{invoice.panCard || "-"}</p>
                </div>
                <div className="rounded border border-[#dcc59d] bg-white px-2 py-1 text-right text-sm font-semibold">{money(invoice.grandTotal || 0, 0)}</div>
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted">Invoice No.</dt><dd className="font-medium text-ink">{invoice.invoiceNo || "-"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Date</dt><dd>{invoice.invoiceDate || "-"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Items</dt><dd>{invoice.itemCount || 0}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Address</dt><dd className="max-w-44 text-right">{invoice.customerAddress || "-"}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
