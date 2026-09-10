# SCANOVA-AI

the project name would be SCANOVA-AI  following is how i imagined project but you can add features also make website user friendly dont make it too complcated do well struturing and desingn and ensure all functions works   MASTER PROMPT — SIH26034

ScanSight — AI-Powered Packaged Commodity Compliance & Inspection Platform

Rebuild the entire application from scratch as a complete, functional, secure, offline-capable SIH prototype for:

SIH26034 – Software System to check compliance of Packaged Commodities under Legal Metrology (Packaged Commodities) Rules, 2011 by scanning products, images and labels.

This is a serious SIH project. Do not create a static UI or a collection of disconnected pages. Build a genuinely working end-to-end system.

Do not preserve the current application's architecture. Regenerate the application structure, database, authentication, roles, backend functions, scanning workflow, OCR, AI extraction, compliance engine, reports, dashboards, analytics, offline functionality and security architecture from the ground up.

🚨 CRITICAL LEGAL SOURCE INSTRUCTION

AN OFFICIAL PDF CONTAINING THE LEGAL METROLOGY (PACKAGED COMMODITIES) RULES, 2011 AND/OR RELEVANT RULE CONTENT IS ATTACHED TO THIS PROJECT.

THIS PDF IS THE PRIMARY LEGAL SOURCE OF TRUTH FOR THE COMPLIANCE ENGINE.

REFER ONLY TO THE ATTACHED PDF WHEN IMPLEMENTING THE LEGAL RULES.

Do NOT:

invent legal requirements

guess legal requirements

hallucinate rules

use generic AI knowledge as a substitute for the PDF

create compliance rules from random internet sources

assume a requirement without finding support in the attached PDF

allow an AI model to independently create legal requirements

Before implementing the rule engine, carefully analyze the attached PDF.

Extract relevant:

rules

sub-rules

definitions

mandatory declarations

conditions

exceptions

thresholds

measurement requirements

formatting requirements

applicable categories

amendments/content included in the PDF

Every machine-readable rule should maintain a reference to its source rule/section and, where possible, PDF page.

If a requirement cannot safely be automated, classify it as:

MANUAL VERIFICATION REQUIRED

rather than inventing an automated check.

The AI can assist with extracting information from the product.

The rule engine must determine compliance using rules derived from the attached PDF.

1. PRODUCT OBJECTIVE

Build an AI-assisted packaged commodity inspection platform that allows authorized inspectors to:

Start an inspection.

Capture product/package images.

Capture multiple sides of the package.

Scan barcode/QR where available.

Extract label information using OCR.

Use AI/computer vision to structure the information.

Identify/confirm the product category.

Determine applicable rules from the configured rule database.

Run deterministic compliance checks.

Show PASS/FAIL/REVIEW results.

Show evidence for every result.

Allow inspectors to correct uncertain OCR/AI information.

Re-run compliance after correction.

Finalize an inspection.

Generate a PDF report.

Store complete inspection history.

Provide analytics and graphs.

Support government authorities and multiple offices.

Work offline.

Synchronize automatically when connectivity returns.

The system should be sophisticated internally but simple to operate.

2. SIMPLE CORE WORKFLOW

The main inspector workflow should be:

NEW INSPECTION

↓

SCAN PRODUCT

↓

CAPTURE IMAGES

↓

EXTRACT INFORMATION

↓

REVIEW INFORMATION

↓

CHECK COMPLIANCE

↓

REVIEW RESULTS

↓

FINALIZE

↓

GENERATE REPORT

Do not force inspectors through unnecessary technical steps.

The user should not need to understand:

OCR

AI models

APIs

JSON

databases

synchronization architecture

rule-engine internals

Keep those details behind the scenes.

3. USER ROLES

Implement proper role-based access control.

Roles:

1. Citizen / Public User

2. Inspector

3. Supervisor / Senior Inspector

4. Manufacturer / Packer

5. Government Authority Administrator

6. System Administrator

4. CITIZEN ROLE

Citizens can:

Register

Verify email

Login

Scan/upload product images

View extracted basic information

Submit suspected non-compliance complaints

Upload evidence

Add optional location

Receive complaint ID

Track complaint status

View their own submissions

Receive status notifications

Citizens must not access:

confidential inspection information

internal government notes

private manufacturer information

rule administration

inspector management

sensitive authority data

5. INSPECTOR ROLE

Inspectors are the primary users.

They can:

Inspection

Start new inspection

Capture camera images

Upload images

Capture multiple package sides

Retake images

Preview images

Crop/rotate where appropriate

Scan barcode/QR

Enter barcode manually

Enter product information manually

Capture location where permitted

AI/OCR

Run OCR

Extract label text

Structure product information

View confidence

Detect uncertain fields

Manually correct extracted information

Compliance

Confirm product category

Run applicable compliance rules

View rule-by-rule results

View evidence

View explanation

View confidence

Mark for manual review

Add inspector observations

Finalize inspection

Reports

Generate PDF report

Download report

View previous reports

Offline

Create inspections offline

Capture images offline

Save inspection information offline

Continue existing inspections

View synchronization status

Synchronize automatically when online

6. SUPERVISOR ROLE

Supervisors can:

View team inspections

Review flagged inspections

Review manual-review cases

Approve/reject/request additional evidence

Add supervisory notes

Monitor inspectors

Review violations

Compare inspection results

View analytics

Generate reports

Review recurring violations

Supervisors cannot silently modify historical finalized evidence.

7. MANUFACTURER / PACKER ROLE

Manufacturers can:

Create company profile

Manage company information

Add products

Maintain product catalogue

Add product category

Add barcode

Upload packaging/label information

Submit supporting information

View authorized compliance information

Respond to flagged issues

Submit corrective information

View their historical authorized records

Manufacturers must NEVER be able to alter official finalized inspection results.

8. GOVERNMENT AUTHORITY ROLE

Create a dedicated:

Government Authority Administrator

role.

An authority represents a government department/organization/office.

Authority administrators can:

Manage authority profile

Create departments

Create offices

Add inspectors

Add supervisors

Assign inspectors to offices/regions

Activate/deactivate authority members

View authority inspections

View authority reports

View authority analytics

View regional statistics

View product/manufacturer statistics

Review flagged inspections

Monitor offline synchronization

View audit logs

Export authorized data

9. MULTI-AUTHORITY ARCHITECTURE

The platform must support multiple government authorities.

Example:

Government Authority
→ Department
→ State/Region
→ District
→ Office
→ Inspectors

Data must be isolated by authority.

Authority A must not automatically access Authority B's private inspection records.

Implement organization-level access control using Supabase RLS.

10. SYSTEM ADMINISTRATOR

System administrator can:

Manage government authorities

Manage system users

Manage roles

Manage system configuration

Manage rule framework

Manage rule versions

Manage AI/OCR integrations

Monitor system health

View platform-level analytics

Review audit logs

Manage permissions

Do not provide unrestricted access to sensitive authority information unless required by the system architecture and authorization policy.

11. AUTHENTICATION

Use Supabase Auth.

Implement:

Signup

Login

Logout

Email verification

Resend verification

Forgot password

Password reset

Session persistence

Protected routes

Role-based routing

IMPORTANT EMAIL VERIFICATION REQUIREMENT

The email OTP/verification system currently has a problem.

Rebuild the authentication flow properly.

Do NOT create a fake OTP.

Do NOT hardcode OTPs.

Do NOT pretend an email was sent if the backend did not actually initiate it.

Correctly implement:

verification email request

verification redirect

resend verification

expired verification handling

invalid verification handling

already verified handling

password reset

session refresh

Authentication secrets must never be exposed in frontend code.

12. SECURITY

Security is a major requirement.

Implement:

Supabase Authentication

Row Level Security

role-based authorization

authority-level data isolation

protected routes

protected storage

secure API calls

environment variables

server-side authorization

database constraints

input validation

file validation

file-size limits

secure sessions

audit logging

rate limiting where practical

safe error handling

signed URLs/private storage where appropriate

Never rely only on frontend checks.

All important authorization must be enforced by backend/database policies.

13. AUDIT TRAIL

Create a complete audit trail.

Track important actions:

user creation

role changes

authority membership changes

inspection creation

image upload

OCR execution

AI extraction

manual correction

rule execution

compliance result

inspection finalization

report generation

rule changes

administrative actions

Store:

user

authority

action

entity

entity ID

timestamp

previous value where appropriate

new value where appropriate

reason where appropriate

Historical inspection evidence must remain traceable.

14. PRODUCT SCANNING

Support multiple scanning methods.

CAMERA / IMAGE SCANNING

This is the PRIMARY scanning method.

Allow:

camera capture

image upload

multiple images

front image

back image

side image

top/bottom image

declaration close-up

preview

retake

crop

rotate

One inspection may contain multiple images.

15. BARCODE / QR SCANNING

Support:

EAN-13

EAN-8

UPC

Code 128

QR

Barcode is supplementary.

It must NOT replace visual inspection.

Use barcode to:

identify product

retrieve known product information

prefill fields

connect product to manufacturer

If barcode data conflicts with the physical package:

FLAG INFORMATION CONFLICT

and require review.

Example:

Database/barcode:
MRP ₹100

Physical package:
MRP ₹120

Result:

CONFLICT DETECTED — MANUAL REVIEW REQUIRED

16. OCR ARCHITECTURE

Use a backend OCR service/function.

Recommended primary OCR:

Google Cloud Vision OCR

Keep OCR provider configurable through environment variables.

Do not expose OCR credentials in frontend.

Architecture:

Product Image
→ Image Preprocessing
→ OCR
→ Raw Text
→ Structured Extraction

Design the OCR abstraction so an alternative such as PaddleOCR can be added later.

17. IMAGE PREPROCESSING

Before OCR, perform appropriate processing:

orientation correction

resizing

quality check

blur detection

sharpening

contrast improvement

perspective correction where possible

If image quality is too poor:

"Image quality is insufficient for reliable extraction. Please capture another image."

Do not generate false confidence.

18. AI / COMPUTER VISION

Use multimodal AI where appropriate.

AI can help:

understand packaging

locate declarations

identify likely MRP region

identify quantity region

detect text regions

identify potential conflicts

classify product

structure OCR output

detect uncertain information

identify possible anomalies

AI must provide confidence where possible.

AI must not fabricate evidence.

19. STRUCTURED INFORMATION EXTRACTION

Extract fields such as:

product/commodity name

manufacturer

manufacturer address

packer

packer address

importer

importer address

MRP

net quantity

consumer care details

phone

email

dates

batch/lot information

country of origin where applicable

other declarations actually detected

Do not assume every field applies to every product.

The AI must distinguish:

Detected

from:

Not detected

from:

Uncertain

20. AI CONFIDENCE

Every AI/OCR field should have confidence.

Use:

HIGH CONFIDENCE

MEDIUM CONFIDENCE

LOW CONFIDENCE

Low confidence must trigger:

NEEDS MANUAL REVIEW

Do not automatically convert uncertainty into a legal violation.

21. LEGAL RULE ENGINE

The rule engine is the CORE of the project.

Rules must be stored as structured database records.

CRITICAL:

Rules must be derived from the ATTACHED PDF ONLY.

The attached PDF is the legal source of truth.

Do not use AI-generated legal knowledge.

Do not invent requirements.

Do not silently use another source to fill missing legal information.

If something is not supported by the attached PDF:

DO NOT CREATE A LEGAL RULE FOR IT.

Instead mark it:

NOT CONFIGURED / MANUAL VERIFICATION REQUIRED

22. RULE DATA STRUCTURE

Each rule should contain:

rule ID

rule number/section

title

requirement

applicable category

conditions

exceptions

validation method

parameters

source PDF

source page

source section

version

effective date where available

active/inactive status

23. RULE VERSIONING

Support:

rule version

effective date

active status

source reference

change history

Historical inspections must remember which rule version was used.

Do not silently apply new rules to old inspections.

24. RULE TYPES

Support:

Presence Check

Is a required declaration present?

Pattern Check

Does the declaration match the required format?

Numeric Check

Can a numerical value be validated?

Unit Check

Is the detected unit valid?

Conditional Check

Does this requirement apply to this product/category?

Cross-field Check

Do two declarations conflict?

Evidence Check

Is enough evidence available?

Manual Review

Cannot safely automate → human verification.

25. COMPLIANCE RESULT

Every rule result must show:

Rule

Requirement

Detected value

Expected condition

Status

Confidence

Evidence

Explanation

Source rule reference

Statuses:

PASS

FAIL

NEEDS REVIEW

NOT APPLICABLE

UNABLE TO VERIFY

26. EXPLAINABLE COMPLIANCE

For every failure/review show:

What was checked

What was detected

What was expected

Why it was flagged

Evidence

Confidence

Rule source

Example:

MRP Declaration

Detected:
₹120

Expected:
Applicable requirement from configured rule

Result:
PASS

Confidence:
98%

Evidence:
Back-label image

Source:
Attached Legal Metrology Rules PDF — relevant rule/page

27. OVERALL RESULT

Show:

Total rules checked

Passed

Failed

Needs review

Not applicable

Unable to verify

Overall:

COMPLIANT

NON-COMPLIANT

NEEDS MANUAL REVIEW

UNABLE TO VERIFY

If displaying a numerical score, label it:

System Assessment Score

Do not imply it is an official legal score.

28. EVIDENCE MANAGEMENT

Preserve:

original images

processed images

OCR output

extracted information

rule results

evidence references

timestamp

inspector

location where permitted

Never overwrite original evidence.

29. MANUAL CORRECTION

Inspector can correct:

OCR text

product name

MRP

quantity

manufacturer

address

other extracted fields

Store:

Original value
+
Corrected value
+
User
+
Timestamp
+
Reason

After correction:

Automatically rerun affected compliance checks.

30. INSPECTION WORKFLOW

Implement:

START INSPECTION

↓

Identify inspector

↓

Location if permitted

↓

Barcode/QR if available

↓

Capture product images

↓

Image quality check

↓

OCR

↓

AI extraction

↓

Product category confirmation

↓

Applicable rule selection

↓

Rule engine

↓

Rule-by-rule results

↓

Evidence review

↓

Manual correction if required

↓

Re-run rules

↓

Inspector finalizes

↓

PDF report

↓

Save history

↓

Sync if offline

31. OFFLINE-FIRST SUPPORT

Offline functionality is a CORE requirement.

Inspectors must be able to work without internet.

Offline capabilities:

open application

start inspection

capture images

save images

enter information

save notes

save location if available

continue inspection

close/reopen application

access locally cached assigned data

view pending synchronization

Use:

PWA + Service Worker + IndexedDB

Do not rely only on localStorage for large inspection data/images.

32. OFFLINE AI/OCR

If OCR/AI cannot run without internet:

Do NOT block the inspector.

Save locally:

inspection

images

metadata

manual information

Create a pending processing state.

When internet returns:

LOCAL INSPECTION
→ SYNC
→ SERVER
→ OCR
→ AI
→ RULE ENGINE
→ RESULT

33. OFFLINE SYNCHRONIZATION

Create a sync queue.

Flow:

LOCAL DATA
→ SYNC QUEUE
→ SERVER
→ DATABASE/STORAGE
→ PROCESSING
→ RESULT

Handle:

retries

duplicate synchronization

network interruptions

partial uploads

failed uploads

server conflicts

Use unique IDs and idempotent operations wherever practical.

Never lose an inspection.

34. SYNC STATUS

Use simple statuses:

🟢 SYNCED

🟡 SYNC PENDING

🔵 PROCESSING

🔴 SYNC FAILED

Show:

number pending

last sync time

retry option

sync-now option

understandable error message

Example:

3 inspections waiting to sync

35. GOVERNMENT AUTHORITY OFFLINE

Government authority users must be able to access previously synchronized relevant data offline.

They should be able to:

view cached records

review cached inspections

add notes

continue available workflows

create offline inspections where permitted

Synchronize securely when online.

36. MAP / GEOLOCATION

Where permission is granted, store:

latitude

longitude

timestamp

Use this for:

inspection mapping

geographic analytics

complaint mapping

regional trends

hotspot identification

If GPS is unavailable, inspection must still work.

37. MAP ANALYTICS

Authorized users can view:

inspection locations

flagged cases

complaint locations

inspection density

violation hotspots

Protect sensitive locations from unauthorized users.

38. DASHBOARDS

Dashboards must use real database data.

Do not create decorative charts with fake values unless clearly labeled demo data.

Keep dashboards easy to understand.

39. INSPECTOR DASHBOARD

Show:

Today's inspections

Completed inspections

Pending review

Failed inspections

Needs-review inspections

Offline pending sync

Recent inspections

40. SUPERVISOR DASHBOARD

Show:

Team inspections

Pending approvals

Violations

Review cases

Inspector activity

Product categories

Compliance trends

41. GOVERNMENT AUTHORITY DASHBOARD

Show:

Total inspections

Compliant

Non-compliant

Needs review

Active inspectors

Product categories

Manufacturer statistics

Regional distribution

Recurring violations

Time trends

42. SYSTEM ADMIN DASHBOARD

Show:

Total authorities

Users

Inspectors

Manufacturers

Inspections

OCR success/failure

AI success/failure

Synchronization failures

System activity

Audit events

43. GRAPHS AND ANALYTICS

Include meaningful graphs.

Inspection Trend

Line chart showing inspections over time.

Compliance Distribution

Chart showing:

compliant

non-compliant

review

Violation Categories

Bar chart showing the most common failed rules.

Product Categories

Bar chart showing inspections by category.

Manufacturer Analysis

Authorized users can compare:

inspections

violations

recurring issues

Regional Analysis

Charts/map showing:

inspection density

violation concentration

Rule Failure Trend

Trend of specific rule failures over time.

OCR/AI Performance

Admin-only:

successful processing

failed processing

low-confidence extractions

Offline Sync

Show:

synced

pending

failed

44. ANALYTICS FILTERS

Allow authorized users to filter graphs by:

date range

authority

department

office

region

inspector

category

manufacturer

compliance status

Charts must update from actual filtered database data.

45. CITIZEN COMPLAINT SYSTEM

Allow citizens to submit suspected violations.

Workflow:

Login

Upload product image

Enter information

Describe issue

Add optional location

Submit

Receive complaint ID

Track status

Statuses:

SUBMITTED

→ UNDER REVIEW

→ ASSIGNED

→ INVESTIGATION

→ RESOLVED / REJECTED

→ CLOSED

46. AI COMPLAINT TRIAGE

AI may assist with:

complaint classification

duplicate detection

evidence quality

priority recommendation

AI must not independently close complaints.

Human authority remains responsible.

47. MANUFACTURER ANALYTICS

Authorized users can view:

inspection count

compliance results

common violations

recurring issues

product category distribution

historical trends

Avoid unsupported "trust scores" unless there is a transparent methodology.

48. REPORT GENERATION

Generate PDF inspection reports containing:

Inspection ID

Authority

Department/Office where applicable

Inspector

Date/time

Location where permitted

Product information

Manufacturer

Barcode

Product images

Extracted declarations

Applicable rules

Rule-by-rule results

Evidence

Manual corrections

Inspector notes

Final decision

Rule version

Report ID

Audit information

49. REPORT INTEGRITY

Each report should have:

unique report ID

inspection ID

generated timestamp

rule version

report checksum/hash where practical

The report must remain traceable to the original inspection.

50. NOTIFICATIONS

Inspector:

processing completed

manual review required

synchronization completed

synchronization failed

Supervisor:

inspection awaiting review

flagged case

Manufacturer:

authorized issue

response requested

Citizen:

complaint status update

51. SEARCH

Authorized users can search:

inspection ID

product

manufacturer

barcode

inspector

category

complaint ID

date

Use pagination.

52. FILTERS

Support:

status

date

category

manufacturer

inspector

authority

office

region

compliance result

review required

synchronization status

53. DATABASE

Use:

Supabase PostgreSQL

Create normalized tables including:

profiles

authorities

authority_members

departments

offices

manufacturers

products

product_scans

scan_images

ocr_results

extracted_declarations

rule_definitions

rule_versions

compliance_checks

inspection_records

complaints

reports

notifications

audit_logs

sync_queue

Use:

foreign keys

indexes

constraints

timestamps

RLS

54. PRODUCT SCAN DATA

Store:

scan ID

user

authority

product

barcode

location

timestamp

scan status

synchronization status

55. OCR DATA

Store:

raw OCR text

provider

confidence

processing status

structured extraction

timestamp

56. COMPLIANCE DATA

Each compliance check should store:

scan

rule

detected value

expected condition

result

confidence

explanation

evidence reference

rule version

timestamp

57. RULE SOURCE TRACEABILITY

Every compliance result must be traceable to:

Attached PDF

→ Rule/Section

→ Configured Rule

→ Detected Product Data

→ Evidence

→ Result

This traceability is extremely important for the SIH demonstration.

58. STORAGE

Use Supabase Storage for:

inspection images

evidence

product images

reports

Keep private evidence protected.

Use appropriate storage policies and signed URLs.

59. API SECURITY

External APIs must be accessed securely.

Use backend/Edge Functions where appropriate.

Never expose:

AI keys

OCR keys

private service-role keys

database secrets

in client-side code.

60. AI FAILURE HANDLING

If OCR fails:

OCR processing failed. Retry or enter information manually.

If AI fails:

AI extraction unavailable. Manual entry is available.

If rule engine fails:

Compliance assessment could not be completed.

If network fails:

Saved offline. It will synchronize automatically when connection returns.

Never fake successful processing.

61. IMAGE QUALITY FAILURE

If the image is too blurry/poor:

Image quality insufficient for reliable verification. Please capture another image.

Do not automatically mark the product non-compliant.

62. DEMO DATA

Create controlled demo records:

Compliant product

Missing declaration

Conflicting information

Low-quality image

Low-confidence OCR

Barcode/package conflict

Manual-review case

Clearly mark:

DEMO DATA

Never represent demo data as real government inspections.

63. DEMO MODE

Create a controlled demonstration workflow.

The team should be able to demonstrate:

Login

New inspection

Product scan

Multiple images

Barcode

OCR

AI extraction

Rule engine

Compliance result

Evidence

Manual correction

Re-check

Finalize

PDF report

Dashboard update

Offline inspection

Reconnect

Automatic synchronization

The demonstration must use the real application pipeline.

Do not create fake processing animations.

64. RESPONSIBLE AI

AI is an assistant.

AI may:

extract

classify

analyze images

estimate confidence

detect anomalies

assist complaint triage

AI must NOT:

invent legal requirements

fabricate evidence

override the rule engine

automatically make unsupported legal claims

convert uncertain OCR into definite violations

Final official enforcement decisions remain with authorized human authorities.

65. ACCESSIBILITY AND SIMPLICITY

The system must be easy for a first-time inspector.

Use simple concepts such as:

Scan Product

Review Information

Check Compliance

Review Result

Finalize Inspection

Generate Report

Avoid unnecessary technical language.

Instead of:

"JSON parsing failed"

show:

"We couldn't process the information. Please retry."

66. ERROR HANDLING

Handle:

authentication errors

OCR failure

AI failure

API timeout

rate limits

database errors

storage errors

network failure

synchronization failure

report generation failure

Never silently fail.

67. PERFORMANCE

Optimize:

image processing

image uploads

OCR

AI calls

database queries

dashboards

offline storage

synchronization

Use pagination and caching where appropriate.

Do not load thousands of records unnecessarily.

68. PWA

Make the system an installable PWA.

Support:

service worker

offline application shell

IndexedDB

offline inspections

local image storage

sync queue

automatic synchronization

69. TESTING

Test:

Authentication

signup

verification

resend

login

logout

password reset

Authorization

roles

authority isolation

RLS

unauthorized access

Scanning

camera

upload

multiple images

barcode

QR

OCR

clear images

blurry images

different layouts

AI

valid extraction

malformed output

low confidence

missing fields

Rule Engine

PASS

FAIL

REVIEW

N/A

unable to verify

Offline

disconnect internet

create inspection

capture images

close application

reopen

reconnect

synchronize

Reports

generate

verify

download

Security

RLS

private storage

role escalation

authority isolation

70. IMPORTANT DEVELOPMENT RULE

Do not consider the project complete just because all pages exist.

Verify that:

every button works

every form saves

authentication works

email verification works

roles work

RLS works

images upload

OCR works

AI extraction works

rule engine works

evidence is stored

manual correction works

reports work

graphs use real data

offline storage works

synchronization works

authority isolation works

audit logs work

errors are handled

no fake processing exists

no broken placeholder buttons remain

71. IMPLEMENTATION PRIORITY

Build in this order:

PHASE 1

Authentication + security + roles + authority structure + database + RLS

PHASE 2

Inspection + camera + image upload + barcode

PHASE 3

OCR

PHASE 4

AI structured extraction

PHASE 5

Legal rule engine based ONLY on attached PDF

PHASE 6

Evidence + manual review

PHASE 7

Inspection finalization + reports

PHASE 8

Dashboards + graphs + analytics

PHASE 9

Citizen complaints + manufacturer portal

PHASE 10

Government authority management

PHASE 11

Offline PWA + IndexedDB + synchronization

PHASE 12

Testing + security hardening + performance

Do not sacrifice the core inspection pipeline for secondary features.

72. CORE ARCHITECTURE

Use this conceptual architecture:

                         USER
                          │
                 ┌────────┴────────┐
                 │                 │
              ONLINE            OFFLINE
                 │                 │
                 ▼                 ▼
           APPLICATION         LOCAL DB
                 │                 │
                 ▼                 │
        CAMERA / IMAGE / BARCODE   │
                 │                 │
                 ▼                 │
          IMAGE QUALITY CHECK      │
                 │                 │
                 ▼                 │
               OCR                 │
                 │                 │
                 ▼                 │
         AI STRUCTURED DATA        │
                 │                 │
                 ▼                 │
          CONFIDENCE CHECK         │
                 │                 │
                 ▼                 │
         PRODUCT CATEGORY          │
                 │                 │
                 ▼                 │
       APPLICABLE LEGAL RULES      │
                 │                 │
                 ▼                 │
           RULE ENGINE             │
                 │                 │
                 ▼                 │
      EXPLAINABLE RESULT           │
                 │                 │
                 ▼                 │
          HUMAN REVIEW             │
                 │                 │
                 ▼                 │
          FINAL INSPECTION         │
                 │                 │
                 ▼                 │
              REPORT               │
                 │                 │
                 └────────┬────────┘
                          │
                   INTERNET RETURNS
                          │
                          ▼
                      SYNC QUEUE
                          │
                          ▼
                        SERVER
                    ┌─────┴─────┐
                    ▼           ▼
                DATABASE      STORAGE
                    │
                    ▼
                ANALYTICS


73. FINAL PRODUCT VISION

The final platform should demonstrate:

SCAN
→ UNDERSTAND
→ CHECK
→ EXPLAIN
→ REVIEW
→ REPORT
→ TRACK

The system should be:

AI-powered

evidence-based

rule-driven

secure

explainable

offline-capable

multi-authority

auditable

scalable

simple for inspectors

The complexity should remain behind the scenes.

The inspector should be able to understand the primary workflow within minutes.

74. FINAL SIH DEMONSTRATION

The strongest demonstration should be:

Real product package

↓

📷 Capture multiple images

↓

🔤 OCR

↓

🤖 AI extracts declarations

↓

⚖️ Rule engine checks rules derived ONLY from the attached PDF

↓

🔍 Evidence-backed PASS / FAIL / REVIEW

↓

✏️ Inspector corrects uncertain information

↓

🔄 Compliance recalculates

↓

✅ Inspector finalizes

↓

📄 PDF inspection report

↓

📊 Dashboard graphs update

Then demonstrate:

Internet OFF

↓

📷 New inspection

↓

💾 Saved locally

↓

Internet ON

↓

🔄 Automatic synchronization

↓

☁️ Server processing

↓

📊 Updated dashboard/report

This end-to-end workflow is the heart of the project.

Build the system around this workflow rather than simply creating many screens.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://scanovai.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2e2d8ba6-818e-4831-8cb0-ba391e4a66ac).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
