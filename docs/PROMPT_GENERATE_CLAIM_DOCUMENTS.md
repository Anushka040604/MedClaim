# Prompt: Generate Sample Documents for Medical Claim Upload

Use this prompt with an AI (e.g. ChatGPT, Claude) or as instructions for humans to create **realistic sample documents** that claimants can upload when starting a claim in the Medical Claim Verification system. The system accepts **PDF or images** (JPG, PNG) and extracts: patient name, hospital, doctor, diagnosis, dates, policy number, claimed amount, and line items.

---

## Copy-paste prompt for AI

```
You are helping create sample medical/insurance claim documents for testing an AI-powered claim verification system. Generate content that can be turned into PDFs or images (e.g. by pasting into a document and exporting as PDF, or by describing a layout for a designer).

**Accepted document types (user must pick one per file):**
1. Prescription  
2. Hospital Bill  
3. Lab Report  
4. Discharge Summary  
5. Other  

**Required format:** Each document must contain plain text that, when OCR’d, will allow extraction of these fields (use clear labels and values):
- patient_name  
- hospital (or clinic name)  
- doctor (attending / prescribing doctor)  
- diagnosis (condition or reason for visit)  
- treatment_date OR admission_date and discharge_date  
- policy_number (insurance policy or member ID)  
- claimed_amount (total bill amount or sum of charges, in numbers)  
- Where relevant: procedure_codes, diagnosis_codes, line_items (description + amount)

Generate **one document per type** below. Use a single, consistent patient and episode (same name, hospital, dates, policy, and amounts across docs). Use Indian Rupees (₹) and a realistic Indian hospital/policy style.

---

**1. PRESCRIPTION**  
Produce the exact text for a one-page prescription slip (letterhead optional). Include:
- Hospital/clinic name and address  
- Doctor name, qualification, registration number  
- Patient name, age/DOB, date of visit  
- Diagnosis / clinical notes (1–2 lines)  
- List of 3–5 medicines with: name, dosage, frequency, duration  
- Doctor’s signature line and date  
- Optional: policy number or “Insurance: [Policy ID]”

---

**2. HOSPITAL BILL (Final bill / invoice)**  
Produce the exact text for a one-page hospital bill. Include:
- Hospital name, address, contact, GST number  
- Bill number, bill date  
- Patient name, UHID/registration number, admission/discharge dates  
- Policy number / TPA / insurance details  
- Table of line items: description (e.g. room charges, surgery, pharmacy, lab), quantity, rate, amount  
- Subtotal, taxes (e.g. GST), discount if any  
- **Total amount (claimed_amount)** in figures and words (₹)  
- “Amount payable” or “Claimed amount” clearly labeled

---

**3. LAB REPORT**  
Produce the exact text for a one-page lab report. Include:
- Lab/hospital name, address, accreditation  
- Report ID, sample date, report date  
- Patient name, age, gender, referring doctor  
- Test name(s) and results (e.g. CBC, Hb, platelets, glucose) with units and reference range  
- Normal/abnormal or “Within normal limits” where relevant  
- Pathologist/signatory name and designation  
- Optional: policy number or “Insurance ref: …”

---

**4. DISCHARGE SUMMARY**  
Produce the exact text for a one-page discharge summary. Include:
- Hospital name and department  
- Patient name, age, UHID, admission date, discharge date  
- Diagnoses: primary and secondary (ICD-10 style codes optional)  
- Brief history and findings  
- Procedures performed (e.g. surgery, investigations)  
- Treatment given and advice on discharge  
- Attending doctor name and signature line  
- Optional: policy number, total bill amount or “Bill attached separately”

---

**5. OTHER**  
Produce one more document that fits the same episode, e.g.:
- A short **consultation note**, or  
- An **investigation slip** (radiology/imaging request), or  
- A **consent form** header + patient name, procedure, date, doctor  

Again include: patient name, hospital, doctor, date, and if applicable policy number or amount.

---

**Consistency rules:**  
- Use one patient name (e.g. “Rajesh Kumar”), one hospital (e.g. “City Care Hospital, Mumbai”), one policy number (e.g. “POL-2024-88761”), and one set of dates (e.g. admission 15-Jan-2025, discharge 18-Jan-2025).  
- Total claimed amount (e.g. ₹1,25,000) should be consistent where the bill is referenced.  
- Use Indian naming, Rupees, and typical Indian hospital formats.

Output the **full text** of each document (1–5) in order, clearly labeled (e.g. “--- DOCUMENT 1: PRESCRIPTION ---”). The user will paste each into a doc and export as PDF, or use the text to design a printable layout.
```

---

## Quick reference: what each document type should contain

| Document type     | Must include for extraction                          | Optional but helpful                    |
|-------------------|------------------------------------------------------|----------------------------------------|
| **Prescription**  | Patient name, doctor, hospital/clinic, date, diagnosis | Policy number, medicines list           |
| **Hospital Bill** | Patient, hospital, dates, **claimed_amount**, line items | Policy number, GST, bill number        |
| **Lab Report**    | Patient, lab/hospital, doctor, date, test results    | Policy number, reference ranges         |
| **Discharge Summary** | Patient, hospital, doctor, admission/discharge dates, diagnosis | Procedure codes, policy, total amount   |
| **Other**         | Patient, hospital or doctor, date                    | Policy, amount, procedure name          |

---

## How users will use these in the app

1. **Create a claim** (Claims → New claim): enter patient name, policy number, hospital, doctor, diagnosis, treatment date, claimed amount.  
2. **Open the claim** and go to **Upload documents**.  
3. For each file, choose the correct **document type** (Prescription, Hospital Bill, etc.).  
4. Upload **PDF or image** (JPG/PNG). Multiple files allowed per claim.  
5. After upload, the AI pipeline runs (OCR → extraction → policy check → risk score). Results appear under **AI report** and charts.

---

## Tips for best extraction

- Use **clear labels** (e.g. “Patient Name:”, “Total Amount:”, “Policy No:”) so OCR and the model can map text to fields.  
- Put **amounts in digits** (e.g. ₹1,25,000 or 125000).  
- Keep **one main episode** (same patient, hospital, dates, policy) across all sample docs so the claim and report stay consistent.
