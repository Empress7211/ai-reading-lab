# Sources and Current Capability Checks

> Checked on 2026-08-04. This list supports current feasibility and competitive claims in the v0.1 package. Provider capabilities, pricing, quotas and terms can change; implementation must re-check them before release.

## Zotero

1. **Zotero Local API**  
   https://www.zotero.org/support/dev/web_api/v3/local_api  
   Used for: localhost API, offline/no-rate-limit behavior, Zotero 10+ write authorization, object versions, file uploads, full-text writes and local attachment paths.

2. **Zotero Web API v3**  
   https://www.zotero.org/support/dev/web_api/v3/  
   Used for: remote fallback and shared API object model.

3. **Zotero Plugin Development**  
   https://www.zotero.org/support/dev/client_coding/plugin_development  
   Used for: evaluating a later optional in-Zotero companion instead of making a plugin an MVP dependency.

4. **Better Notes for Zotero**  
   https://github.com/windingwind/zotero-better-notes  
   Used for: validating existing demand for Markdown note export/synchronization patterns. It is not a product dependency.

## GitHub

5. **Authorizing OAuth apps / recommendation to consider GitHub Apps**  
   https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps  
   Used for: GitHub App choice, fine-grained repository access and short-lived tokens.

6. **Repository contents REST API**  
   https://docs.github.com/en/rest/repos/contents  
   Used for: file create/update permissions and remote-write design constraints.

## PDF reading and parsing

7. **Mozilla PDF.js**  
   https://github.com/mozilla/pdf.js/  
   Used for: HTML5 PDF rendering/parsing layer in the reader.

8. **Docling**  
   https://docling.org/  
   Used for: local structured PDF conversion, layout/reading-order, table extraction, bounding boxes, JSON/Markdown and OCR options.

9. **PyMuPDF licensing**  
   https://pymupdf.readthedocs.io/en/latest/about.html  
   Used for: reminding engineering to review AGPL/commercial licensing before selecting it as a bundled default.

## Scholarly metadata, recommendation and open access

10. **OpenAlex Works API**  
    https://developers.openalex.org/api-reference/works  
    Used for: works, identifiers, concepts/topics, citation relations and open-version metadata.

11. **OpenAlex authentication and pricing**  
    https://developers.openalex.org/how-to-use-the-api/rate-limits-and-authentication  
    Used for: capacity/cost assumptions; re-check before production.

12. **Semantic Scholar Academic Graph API**  
    https://api.semanticscholar.org/api-docs/graph  
    Used for: paper metadata, references, citations and available OA fields.

13. **Semantic Scholar Recommendations API**  
    https://api.semanticscholar.org/api-docs/recommendations  
    Used for: seed-paper-based candidate recall.

14. **Unpaywall API**  
    https://data.unpaywall.org/products/api  
    Used for: DOI-based legal open-access locations.

15. **Crossref REST API**  
    https://www.crossref.org/documentation/retrieve-metadata/rest-api/  
    Used for: DOI metadata, licenses, post-publication updates and identifiers.

16. **scite API**  
    https://api.scite.ai/docs  
    Used for: optional supporting/contrasting/mentioning citation-context signals. Commercial terms and field coverage require separate review.

## Competitive landscape

17. **Connected Papers — About**  
    https://www.connectedpapers.com/about  
    Used for: similarity graph, prior and derivative work positioning.

18. **Litmaps — Features**  
    https://www.litmaps.com/features  
    Used for: search, visualization, monitoring and Zotero sync claims.

19. **Elicit — Systematic Review**  
    https://elicit.com/blog/systematic-review/  
    Used for: research-question-driven screening, extraction, supporting quotes, user overrides and living reviews.

20. **SciSpace ChatPDF / Copilot**  
    https://scispace.com/resources/introducing-copilot-ai-assistant-explains-research-papers/  
    Used for: in-PDF explanation, highlights/notes and Zotero import claims.

21. **scite**  
    https://scite.ai/  
    Used for: Smart Citation product positioning.

## Usage notes

- A URL that yields a PDF does not by itself establish permission to redistribute it.
- API availability does not establish that every returned field may be cached or commercially displayed without attribution; review each provider's terms and notices.
- Competitive descriptions are product-positioning summaries, not exhaustive procurement audits.
- This product package is not legal advice.
