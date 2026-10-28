# Production test Orders — cleanup preflight

Backup/restore PASS. No physical DELETE; only existing `order_delete` after revalidation. All six candidates have no callback jobs.

| ID | SBID | Location | Created at (UTC) | Comment | Status | Callback | Evidence |
|---|---|---|---|---|---|---|---|
| 3 | LOCATION-SMOKE-20261007T151611Z-podgorna | SB_Podgorna | 2026-10-07 15:16:15.638357+00 | NIE PRZYGOTOWYWAĆ — kontrolowany test lokalizacji | TO_DO | none | Exact SBID and ID in archived location-routing backend smoke, source external-v1, matching creation audit |
| 4 | LOCATION-SMOKE-20261007T151611Z-czerwca | SB_Poznan 2.0 | 2026-10-07 15:16:17.051742+00 | NIE PRZYGOTOWYWAĆ — kontrolowany test lokalizacji | TO_DO | none | Exact SBID and ID in archived location-routing backend smoke, source external-v1, matching creation audit |
| 6 | LOCATION-SMOKE-20261007T151611Z-damrota | SB_Katowice | 2026-10-07 15:16:19.587795+00 | NIE PRZYGOTOWYWAĆ — kontrolowany test lokalizacji | TO_DO | none | Exact SBID and ID in archived location-routing backend smoke, source external-v1, matching creation audit |
| 695 | — | SB_Wroclaw | 2026-10-26 18:12:40.367483+00 | ZAMÓWIENIE TESTOWE — nie dla klienta. Test uprawnień Orders: przejęcie, częściowe ilości, krojenie, wydanie. Brak integracji i callbacku. Po teście usuń kontem administrator/manager. | COMPLETED | none | is_test=true, source operator-smoke, exact IDs in role-access smoke evidence, matching ORDER_CREATED audit |
| 696 | — | SB_Wroclaw | 2026-10-26 18:12:40.367483+00 | ZAMÓWIENIE TESTOWE — nie dla klienta. Test uprawnień Orders: przejęcie, częściowe ilości, krojenie, wydanie. Brak integracji i callbacku. Po teście usuń kontem administrator/manager. | COMPLETED | none | is_test=true, source operator-smoke, exact IDs in role-access smoke evidence, matching ORDER_CREATED audit |
| 697 | — | SB_Wroclaw | 2026-10-26 18:12:40.367483+00 | ZAMÓWIENIE TESTOWE — nie dla klienta. Test uprawnień Orders: przejęcie, częściowe ilości, krojenie, wydanie. Brak integracji i callbacku. Po teście usuń kontem administrator/manager. | COMPLETED | none | is_test=true, source operator-smoke, exact IDs in role-access smoke evidence, matching ORDER_CREATED audit |

## Result

All six records were soft-deleted through `order_delete` at 2026-10-27 20:36:42 UTC after transactional identity/callback revalidation. Order_items were preserved. No callback replay or new callback job. Protected evidence: `tmp/shift-functions/cleanup-result.json`.

Historical smoke IDs 5 and 8 were already soft-deleted on 2026-10-26 and were left unchanged.
