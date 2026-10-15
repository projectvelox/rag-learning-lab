"""The fictional corpus used by every game on the site.

Lakbay Freight Inc. is invented. Its documents are written to reproduce, on purpose,
the problems real project documents have: a requirement spec whose facts went stale,
a newer document that corrects it, codes that vector search struggles with, a footer
repeated on every page, Word form placeholders, and a file saved under the wrong
client's name. No real client data is in this repository.
"""

CLIENT = "Lakbay Freight Inc."
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "  # BGE retrieval instruction

DOCS = [
    {
        "id": "urs", "type": "business_process", "date": "2021-05-18",
        "title": "URS LKB-URS-007 v1.1 - TMS to ERP Billing Integration",
        "sections": [
            ("Introduction",
             "This user requirement specification describes how Lakbay Freight's Transport Management System "
             "(TMS) sends customer billing to the ERP. There are two customizations: CR-01, where the TMS pushes "
             "invoices through a web service, and CR-02, where client companies that are not on the TMS upload "
             "a CSV file by hand."),
            ("CR-01 Process",
             "1. The TMS sends billing data to the ERP through a web service.\n"
             "2. The data lands in staging tables first.\n"
             "3. The ERP creates a sales invoice from the staged data.\n"
             "4. The created sales invoice is reviewed and manually posted by the billing team."),
            ("Header Field Mapping",
             "|TMS field|ERP field|Rule|\n|---|---|---|\n"
             "|-|No.|Automatic number series, e.g. INV0000001|\n"
             "|Client Code|Customer No.|Must exist in the ERP and must not be blocked|\n"
             "|Invoice Number|External Document No.|Up to 35 alphanumeric characters; must be unique|\n"
             "|Currency|Currency Code|Blank means PHP|"),
            ("Line Field Mapping",
             "|TMS field|ERP field|Rule|\n|---|---|---|\n"
             "|Item Code|No.|Must exist in the item list|\n"
             "|Qty|Quantity|Must be greater than zero|\n"
             "|UOM|Unit of Measure Code|Must match the item's base unit of measure|\n"
             "|Rate|Unit Price|Price per unit, two decimals|"),
            ("Tax Posting Groups",
             "|Group|Code|Meaning|\n|---|---|---|\n"
             "|VAT Bus.|CEXEMPT|Customer exempt|\n"
             "|VAT Bus.|CVAT|Customer VAT|\n"
             "|VAT Bus.|CZERORATED|Customer zero-rated|\n"
             "|WHT Prod.|W158|1% supplier of goods|\n"
             "|WHT Prod.|W160|2% supplier of services|\n\n"
             "Common value will be W160."),
            ("Dimensions",
             "Global Dimension 1 = Product. Global Dimension 2 = Segment. Default dimension values come from the "
             "customer and item cards with Value Posting = Same Code."),
            ("CR-02 Manual Upload Validations",
             "Filename: validate that the file name does not already exist in the upload archive. "
             "Date: must be a valid date. Quantity: zero or dash values are rejected. "
             "Hash total: must equal the sum of the individual lines."),
            ("Sign-off",
             "We agree that the requirements above cover the needs of this project. Additional specifications "
             "not covered by this document will incur additional cost."),
        ],
    },
    {
        "id": "design", "type": "project_doc", "date": "2026-09-03",
        "title": "Technical Design Document - TMS Billing Integration",
        "sections": [
            ("Overview",
             "The ERP exposes a SOAP web service, TMSInvoice, that the TMS calls from its Billing screen with the "
             "Send to ERP button. One call can carry many invoices, each with many lines. The ERP stages the data, "
             "validates it and creates a draft sales invoice, returning the new document number in the same response."),
            ("Authentication",
             "The TMS authenticates with OAuth 2.0 client credentials (service-to-service). It requests a token "
             "from the identity provider and sends it as a Bearer token with every call."),
            ("Completion Flag",
             "The TMS sets IsFinalLine = true on the last line of each invoice and false on the others. When the "
             "final line arrives, the ERP knows the invoice is complete and creates the sales invoice immediately."),
            ("Assumptions",
             "Every customer and item the TMS sends already exists in the ERP. Default dimensions and posting "
             "groups are set up on the customer and item cards. The TMS sends no dimensions."),
            ("Acceptance",
             "Any change in scope will be handled as a Change Order with its own delivery date. "
             "Author: Paolo Reyes, Developer."),
        ],
    },
    {
        "id": "fieldmap", "type": "project_doc", "date": "2026-08-20",
        "title": "Field Mapping Specification - TMS to ERP",
        "sections": [
            ("Confirmations Log",
             "2026-08-20, functional team: live Global Dimension 1 = DEPT and Global Dimension 2 = SEGMENT. "
             "The 2021 URS value 'Product' is stale. TMS sends no dimensions; the ERP fills them from default dimensions."),
            ("Extension Objects",
             "|Object|Name|Purpose|\n|---|---|---|\n"
             "|Table 50101|LKB Staging Header|Staged invoice headers|\n"
             "|Table 50102|LKB Staging Line|Staged invoice lines|\n"
             "|Table 50103|LKB Integration Log|Step-by-step trace of every push|\n"
             "|Codeunit 50110|LKB Invoice Processing|Validates staged data and creates the sales invoice|"),
            ("Open Items",
             "The PH localization license expires on 2026-08-29. Renew it, or VAT and withholding tax posting "
             "will break. Confirm that the INV number series exists."),
        ],
    },
    {
        "id": "guide", "type": "project_doc", "date": "2026-08-28",
        "title": "Web Service Integration Guide",
        "sections": [
            ("Endpoint",
             "SOAP endpoint (sandbox): https://erp.example.com/Sandbox_0812/WS/LKB/Page/TMSInvoice. "
             "Operation: CreateMultiple."),
            ("Reading the Response",
             "Success means Document_No is not empty. On a validation failure Document_No is empty and "
             "Error_Message starts with ERROR:, for example 'ERROR: Line 10000: Item BX-99 does not exist.' "
             "Fix the data at the source and re-send."),
            ("Duplicates",
             "If an External Document No. that was already used is sent again, the ERP does not create a second "
             "invoice. It returns the existing invoice's Document_No and treats the call as a success."),
        ],
    },
    {
        "id": "readme", "type": "project_doc", "date": "2026-09-09",
        "title": "Integration README - architecture and operations",
        "sections": [
            ("Production Endpoint",
             "Production: https://erp.example.com/Production/WS/LKB/Page/TMSInvoice. This replaces the sandbox "
             "endpoint shown in the integration guide."),
            ("Why Drafts",
             "Invoices are created as drafts and never posted automatically. This keeps unvalidated external data "
             "out of the financial ledger until a person has reviewed it."),
            ("Line Matching",
             "The TMS sends the same entry number on every push, so lines cannot be matched to headers by that "
             "number. The header records a line watermark, and it owns only the lines inserted after that watermark."),
            ("Permissions",
             "Assign the LKB Integration permission set plus a base set for sales documents to the TMS service app "
             "and to every billing user who reviews the staging queue."),
            ("Dimensions Update",
             "Since September 2026 the TMS sends two dimensions per line, Global_Dimension_2 and "
             "Shortcut_Dimension_1. Other dimensions still come from the customer and item cards."),
        ],
    },
    {
        "id": "signoff", "type": "contract", "date": "2026-09-10",
        "title": "Project Completion Sign-Off",
        "sections": [
            ("Summary", "Client: Lakbay Freight Inc. Production deployment date: September 8, 2026."),
            ("Deployment",
             "Version 1.0.0.12 of the TMS integration was deployed to production on September 3, 2026, after "
             "user acceptance testing."),
            ("Validation and Acceptance",
             "Production validation was performed by Rosa Villanueva of Lakbay Freight Inc. on September 10, 2026. "
             "Supporting document: Technical Design Document."),
        ],
    },
]

# Typed relationships between documents (what only someone on the project knows).
RELATIONS = [
    ("design", "implements", "urs"),
    ("fieldmap", "updates", "urs"),
    ("readme", "updates", "guide"),
    ("readme", "updates", "design"),
    ("guide", "details", "design"),
    ("signoff", "accepts", "design"),
]

# Raw page footer and Word placeholders injected into the Chunk Lab's version of the URS.
FOOTER = "CONFIDENTIAL - Lakbay Freight Inc. internal document. Do not distribute."
PLACEHOLDERS = ["Click or tap here to enter text.", "Choose an item."]

# Questions used by the search, fusion, rerank and scoring games.
QUERIES = [
    {"id": "last-line", "text": "How does the TMS tell the ERP it has sent the last line of an invoice?",
     "answers": ["design#Completion Flag"]},
    {"id": "licence", "text": "Which licence is about to lapse?",
     "answers": ["fieldmap#Open Items"]},
    {"id": "w160", "text": "W160", "answers": ["urs#Tax Posting Groups"]},
    {"id": "codeunit", "text": "What does codeunit 50110 do?", "answers": ["fieldmap#Extension Objects"]},
    {"id": "twice", "text": "What happens if the same invoice number is sent twice?",
     "answers": ["guide#Duplicates"]},
    {"id": "dim1", "text": "Which dimension is Global Dimension 1 in the live system?",
     "answers": ["fieldmap#Confirmations Log"]},
    {"id": "auto-post", "text": "Are invoices posted automatically?",
     "answers": ["readme#Why Drafts", "urs#CR-01 Process"]},
    {"id": "validated", "text": "Who validated the go-live?", "answers": ["signoff#Validation and Acceptance"]},
    {"id": "scope", "text": "What happens if the client asks for something outside the agreed scope?",
     "answers": ["urs#Sign-off", "design#Acceptance"]},
    {"id": "csv-name", "text": "What check is done on the name of an uploaded CSV file?",
     "answers": ["urs#CR-02 Manual Upload Validations"]},
]

# Sentences for the meaning map (level 1).
SENTENCES = [
    ("billing", "The invoice was posted to the ledger."),
    ("billing", "The bill was recorded in the accounting books."),
    ("billing", "Sales invoices are reviewed before posting."),
    ("billing", "The invoice was not posted."),
    ("billing", "Na-post na ang invoice."),
    ("licence", "The tax license expires at the end of August."),
    ("licence", "Renew the localisation licence or VAT posting breaks."),
    ("auth", "The service authenticates with OAuth client credentials."),
    ("auth", "A bearer token is sent with every request."),
    ("auth", "Users sign in with a password."),
    ("chunking", "Split long documents into smaller passages."),
    ("chunking", "Each chunk should be about one topic."),
    ("codes", "W160"),
    ("codes", "W161"),
    ("codes", "Codeunit 50110"),
    ("codes", "CU50110"),
    ("dimensions", "Global Dimension 1 is the department."),
    ("dimensions", "Global Dimension 1 is the product."),
    ("other", "I had adobo for lunch."),
    ("other", "It will rain in Manila tomorrow."),
    ("other", "The basketball game went into overtime."),
]

# "Which one is closer to A?" prediction pairs (level 1). Lessons are written per outcome in the site.
PAIRS = [
    {"id": "paraphrase", "a": "The invoice was posted to the ledger.",
     "b1": "The bill was recorded in the accounting books.", "b2": "The invoice was printed on paper."},
    {"id": "negation", "a": "The invoice was posted.",
     "b1": "The invoice was not posted.", "b2": "The bill was recorded in the books."},
    {"id": "codes", "a": "W160", "b1": "W161", "b2": "2% withholding tax on services"},
    {"id": "dimension", "a": "Global Dimension 1 is the department.",
     "b1": "Global Dimension 1 is the product.", "b2": "DEPT is the first global dimension."},
    {"id": "tagalog", "a": "The invoice was posted.",
     "b1": "Na-post na ang invoice.", "b2": "The invoice was printed."},
    {"id": "spelling", "a": "The tax license expires at the end of August.",
     "b1": "Renew the localisation licence or VAT posting breaks.", "b2": "The tax office closes at the end of August."},
]
