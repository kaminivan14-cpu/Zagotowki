# Regresja menu nagłówka — UAT

## Przyczyna

Wspólny `Menu` w `src/ui/ModuleHeader.jsx` zamykał `<details>` w `onBlur` zawsze, gdy `contains(event.relatedTarget)` było false. Dla `relatedTarget=null` zamknięcie następowało również podczas interakcji z pozycją menu, zanim przeglądarka wysłała `click`. Pozycja znikała, więc poprawnie podpięty handler nie był wywoływany.

Błąd odtworzono na poprzednim kodzie w izolowanym Chromium: pointerdown na pozycji bez przejęcia fokusu, blur summary z relatedTarget=null, następnie click. Test otwarcia Czasu pracy zakończył się błędem. To test kolejności zdarzeń; nie używano Safari ani sesji użytkownika.

## Wspólna poprawka

- `onBlur` zamyka tylko przy znanym celu fokusu poza menu. Null nie przerywa kliknięcia.
- Pointerdown poza menu zamyka je niezależnie od przejęcia fokusu; listener usuwany przy unmount.
- Jedna implementacja pozycji: natywny button `type=button`, istniejący disabled, bezpośredni click zamyka menu i wywołuje przekazany callback.
- Usunięto delegowane zamykanie na kontenerze. Brak stopPropagation lub nowych handlerów biznesowych.
- Escape zamyka i oddaje focus do summary; Tab opuszczający menu zamyka je. Dotychczasowy focus-visible zachowany.

## Audyt wszystkich przeniesionych akcji

| Moduł / pozycja | Zachowany handler i ograniczenia |
| --- | --- |
| Orders / Czas pracy | ModuleShell `setPanel(true)`, istniejące `worktime.access`, ukrycie modułu bez unmount |
| Orders / Pracownicy | OrdersApp `setEmployeesOpen(true)`, istniejące `employees.manage` |
| Orders / Wyloguj | `WorktimeProvider.logout` → istniejący dialog lub `onSignOut` |
| Zagotówki / Czas pracy | ten sam panel ModuleShell, zachowany lokal i ekran |
| Zagotówki / Pracownicy | App `pobierzPracownikow`, niezmienione ograniczenie ról |
| Zagotówki / Wyloguj | App `wylogujPracownika` → `WorktimeProvider.logout` |

Wszystkie pozycje są prawdziwymi buttonami z callbackiem. Nie znaleziono blokujących pointer-events ani nakładki; z-index menu 100, istniejący dialog czasu pracy 2000. Disabled nadal wynika z dotychczasowego stanu zapisu. Nie zmieniono permissions, auth, Work_shifts, RPC ani bazy.

## Testy

Macierz: 375/768/1440 px × Orders/Zagotówki × click/touch/Enter/Space/null-focus. W każdym przypadku: Czas pracy, powrót do tego samego lokalu, Pracownicy, powrót, Wyloguj, zamknięte menu i istniejący dialog. Sprawdzane zachowanie aktywnej sesji dla „Tylko wyloguj”, zakończenie dla „Zakończ pracę i wyloguj”, pojedyncze wywołanie logout, wyczyszczenie sesji SDK i ekran logowania. Dodatkowo brak aktywnej sesji, kliknięcie poza menu, Escape, Tab i focus-visible.

## Ręczny smoke

Na UAT sprawdzić Narzędzia → Czas pracy, Narzędzia → Pracownicy i Konto → Wyloguj w obu modułach na używanym tablecie. Dla przygotowanego konta UAT z aktywną pracą sprawdzić obie opcje istniejącego dialogu, logując się ponownie pomiędzy próbami. Użyć także Enter/Space przy podłączonej klawiaturze. Menu powinno zniknąć po wyborze, bez utraty lokalu po powrocie.

Wdrożenie wyłącznie frontend Preview, bez migracji. Production i main nietknięte.

## Wyniki lokalne 2026-10-03

- Przed poprawką: scenariusz null-focus nie otwierał Czasu pracy (FAIL odtwarzający błąd).
- Po poprawce: targeted Worktime/menu 43/43 PASS.
- Pełny Playwright: 112/112 PASS, wyłącznie izolowany Chromium i dane syntetyczne.
- Node: 103/103 PASS, w tym PIN/Auth i istniejące workflow.
- Orders PostgreSQL: 189/189 PASS w każdej z dwóch ścieżek (baseline i Tasks upgrade).
- Worktime PostgreSQL: 58/58 PASS; Tasks PostgreSQL: 111/111 PASS.
- Regresja dotychczasowej produkcji `test:migration`: PASS w lokalnym PGlite.
- Lint, build:uat, diff-check: PASS. Istniejące ostrzeżenie bundlera o chunku >500 kB.
- Preview/UAT i ręczny smoke oczekują na push. Brak migracji i zdalnych operacji DB.
