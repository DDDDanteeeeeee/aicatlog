# AI Catalog Agent Product Spec

## Product Goal

AI Catalog Agent is a sellable local desktop product focused only on Adobe Illustrator `.ai` files. It translates text inside editable `.ai` design source files from the detected source language into the customer's selected target language while preserving design assets, layers, layout, vector objects, and final `.ai` editability.

## MVP Buyer Promise

The buyer pays on an external ecommerce/private channel and receives a Windows desktop installer, one activation code, and point-code access according to the purchased package. After activation and point redemption, they can select a local Illustrator `.ai` file, confirm the estimated point cost, run translation, and receive a translated editable `.ai` file plus a QA report. Model API configuration is operated on the cloud backend and is not exposed as a customer setup step or packaged into the installer.

## In-Product Scope

- Account identity plus activation code unlock.
- One-activation-code-one-device binding via backend license verification.
- Local encrypted storage for user credentials, license tokens, and point balance state.
- Point-code redemption, point balance display, estimated task cost, consume-before-run, and refund-on-task-failure.
- Local execution detection.
- Local `.ai` file selection.
- Text extraction from Illustrator through local automation.
- Non-empty editable text extraction with automatic source-language detection.
- Translation through the cloud translation proxy, which calls a maintainer-managed OpenAI-compatible model endpoint.
- Structured translation validation.
- Translation writeback into the original Illustrator document structure.
- Editable `.ai` output.
- QA report with extracted, translated, skipped, and error counts.

## Out-of-Product Scope

- Operating system preparation.
- Design software preparation.
- Non-Illustrator file formats such as PPT, PDF, Word, Excel, PSD, and images.
- Model API key source, purchase, or customer-side configuration.
- User network setup.
- Design file repair when the source file itself is corrupted.

## China Domestic Network Constraint

The product must not depend on Vercel, Netlify, Google-hosted services, or other infrastructure that may be unreliable in mainland China. Production deployment should use a domestic-accessible backend with a cloud translation proxy and maintainer-managed OpenAI-compatible model endpoints.

Recommended deployment shape:

- Desktop app: Electron Windows installer.
- Activation and translation backend: domestic cloud or Hong Kong/Singapore region with stable mainland access.
- Payment: handled outside the product through ecommerce/private channels.
- Usage billing: handled in product through activation-bound point codes.
- Model: backend-only maintainer-managed OpenAI-compatible endpoint.
- File processing: fully local. Source `.ai` files do not need to leave the machine.

## Production Release Criteria

- Windows installer can be generated.
- App opens as a desktop app, not only a browser page.
- Activation-code unlock flow is wired to a backend-compatible request contract.
- User-facing UI does not expose model API configuration.
- Maintainer model configuration is provided only on the backend environment and is not returned to the renderer or local runner.
- Local runner can extract text from `.ai`, call the cloud translation proxy, write translated `.ai`, and return report.
- Failures are surfaced as actionable task errors.
- Packaging does not depend on services that are blocked or unreliable in China at runtime.
