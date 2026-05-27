# AI Catalog Agent Product Spec

## Product Goal

AI Catalog Agent is a sellable local desktop product focused only on Adobe Illustrator `.ai` files. It translates English text inside editable `.ai` design source files while preserving design assets, layers, layout, vector objects, and final `.ai` editability.

## MVP Buyer Promise

The buyer pays on an external ecommerce/private channel and receives a Windows desktop installer plus one activation code. After activation and filling their own AI model API configuration, they can select a local Illustrator `.ai` file, run translation, and receive a translated editable `.ai` file plus a QA report.

## In-Product Scope

- Account identity plus activation code unlock.
- One-activation-code-one-device binding via backend license verification.
- Local encrypted storage for user credentials and model API Key.
- User-fillable model provider, endpoint, model, and API Key.
- Local execution detection.
- Local `.ai` file selection.
- Text extraction from Illustrator through local automation.
- English text filtering.
- Translation through an OpenAI-compatible model endpoint.
- Structured translation validation.
- Translation writeback into the original Illustrator document structure.
- Editable `.ai` output.
- QA report with extracted, translated, skipped, and error counts.

## Out-of-Product Scope

- Operating system preparation.
- Design software preparation.
- Non-Illustrator file formats such as PPT, PDF, Word, Excel, PSD, and images.
- API Key source or purchase.
- User network setup.
- Design file repair when the source file itself is corrupted.

## China Domestic Network Constraint

The product must not depend on Vercel, Netlify, Google-hosted services, or other infrastructure that may be unreliable in mainland China. Production deployment should use a domestic-accessible backend and OpenAI-compatible model endpoints that the user can configure.

Recommended deployment shape:

- Desktop app: Electron Windows installer.
- Activation backend: domestic cloud or Hong Kong/Singapore region with stable mainland access.
- Payment: handled outside the product through ecommerce/private channels.
- Model: user-configurable OpenAI-compatible endpoint.
- File processing: fully local. Source `.ai` files do not need to leave the machine.

## Production Release Criteria

- Windows installer can be generated.
- App opens as a desktop app, not only a browser page.
- Activation-code unlock flow is wired to a backend-compatible request contract.
- API Key is not stored in plain text.
- Local runner can extract text from `.ai`, call model, write translated `.ai`, and return report.
- Failures are surfaced as actionable task errors.
- Packaging does not depend on services that are blocked or unreliable in China at runtime.
