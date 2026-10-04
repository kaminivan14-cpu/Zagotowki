# Zagotówki — uproszczenie ekranu planu

Branch `feature/orders`. Frontend only; brak zmian backendu, RPC, uprawnień, schematu i danych.

## Zmiana UI

- Kontekstowy pasek: dyskretne `← Lista planów`, `Plan DD.MM.RRRR` i mały badge istniejącego statusu. Globalny nagłówek modułu pozostaje dostępny.
- Sekcja `Do zrobienia` z `Pozostało: N` i głównym przyciskiem `+ Dodaj pozycję`.
- `Więcej`: Edytuj plan, Historia, Zapotrzebowanie ogólne, Usuń plan. Dostępność zależy od dotychczasowych props/uprawnień.
- Usuń plan ma czerwony tekst i separator. Nadal wywołuje istniejący handler App: ochrona historii → window.confirm → delete_production_plan. Nie utworzono nowej ścieżki usuwania.
- Zachowano dotychczasowy formularz dodawania, akcje pozycji, zakończenie/wznowienie planu oraz wszystkie handlery nawigacji. Edytor planowania i ekran historii nie są przebudowywane.
- Menu ponownie wykorzystuje poprawiony wspólny komponent z ochroną przed blur(null). Dodano opcjonalny styl akcji ryzykownej i indywidualny disabled; dotychczasowi konsumenci pozostają bez zmiany zachowania.
- Mobile: pasek planu zawija się, dodawanie i Więcej pozostają obok siebie. Natywne buttony/summary, nazwa dostępności menu, focus-visible, Tab/Enter/Space/Escape i dotyk.

## Regresje UI

375/768/1440 px: pełne dodanie pozycji przez istniejące RPC (mock), wejście w edycję, historię, zapotrzebowanie, powrót do listy, anulowanie i zatwierdzenie potwierdzenia usunięcia. Dodatkowo worker bez edycji/usuwania, plan z rozpoczętymi pozycjami, plan zakończony, klawiatura/focus. Zrzuty lokalne `tmp/production-plan.local/`.

## Ręczny smoke UAT

1. Otwórz aktywny testowy plan. Sprawdź datę, badge, liczbę pozostałych pozycji i brak szeregu równorzędnych przycisków.
2. Dodaj testową pozycję; sprawdź odświeżenie listy i licznika.
3. Z Więcej otwórz kolejno Edytuj plan, Historię i Zapotrzebowanie ogólne. Sprawdź powroty.
4. Na osobnym pustym/testowym planie wybierz Usuń plan: najpierw anuluj, następnie potwierdź. Nie usuwaj planu z rzeczywistymi danymi.
5. Sprawdź rolę wykonawcy: brak niedozwolonych opcji. Plan z historią nadal nie może zostać usunięty.
6. Powtórz na tablecie dotykiem, na desktop klawiaturą; Więcej zamyka się po akcji i po Escape.

Wdrożenie wyłącznie Vercel Preview/UAT. Brak migracji. Production/main nietknięte.

## Wyniki lokalne

- Targeted ekran planu: 6/6 PASS.
- Pełny Playwright: 118/118 PASS w izolowanym Chromium na danych syntetycznych.
- Node: 103/103 PASS (w tym PIN/Auth i istniejące workflow).
- Orders PostgreSQL: 189 PASS w każdej z dwóch ścieżek — baseline i Tasks upgrade.
- Worktime PostgreSQL: 58 PASS; Tasks PostgreSQL: 111 PASS.
- `test:migration`: PASS lokalnej regresji dotychczasowej produkcji.
- Lint, build:uat i diff-check: PASS. Pozostaje dotychczasowe ostrzeżenie o chunku >500 kB.
- Wszystkie testy baz wyłącznie lokalne. Preview i smoke UAT oczekują na push; brak migracji.
