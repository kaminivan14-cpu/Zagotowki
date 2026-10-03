# Cleanup UI — Orders / Zagotówki / Czas pracy

Branch: `feature/orders`. Wyłącznie frontend; bez migracji, zmian RPC, RLS, uprawnień lub konfiguracji Supabase.

## Zakres

- Wspólny kompaktowy nagłówek: Narzędzia, Moduły, Konto; istniejące bramki dostępu do pracowników i czasu pracy.
- Zagotówki: status wspólnej sesji w nagłówku, kompaktowe karty wyboru lokalu, później selector. Zmiana lokalu korzysta z istniejącej funkcji; rozpoczęcie/zakończenie pracy zachowuje dotychczasowe RPC. Edytor planów, historia, Tasks/Robota i raporty nie są przebudowywane.
- Orders: jeden helper sortujący oba widoki, priorytet overdue → urgent → warning → normal, następnie deadline ASC, brak deadline na końcu według received_at (fallback sent_to_kitchen_at). Filtry pilności są rozłącznymi kategoriami, takimi jak kolory kart: „≤ 30 min” oznacza 10–30 min, „≤ 10 min” oznacza 0–10 min; overdue osobno. Stan filtra jest wspólny dla trybów.
- Rzeczywisty czas przygotowania pochodzi wyłącznie z `orders_board.sent_to_kitchen_at` (istniejący kontrakt `202610030001_orders_board.sql`). Oddzielna etykieta przewidywanego czasu. Lokalny zegar co 15 sekund; dotychczasowy polling danych bez zmian.
- Zachowane: montowanie obu widoków po pierwszym wejściu, pending UUID, częściowe ilości, grupowanie zestawów, workflow i serwerowy ack alertów. Akcja „Zobacz zamówienie” dodatkowo usuwa filtr pilności, aby cel był widoczny.
- Czas pracy: rozwijane informacje, segmented control, zwarta belka filtrów, jawny format DD.MM.RRRR, małe KPI, liczby po prawej i badge statusów. W podsumowaniu status wymaga uwagi pochodzi z istniejącego `worktime_list` (paginacja), nie z sumy godzin. Eksport nadal serwerowy i respektuje filtry.

## Ograniczenia

- Drawer szczegółów pracownika pozostaje TODO zgodnie z dopuszczonym zakresem. Sesje, korekty i audyt są dostępne w istniejącym widoku Lista po wybraniu pracownika.
- Zakończone zamówienia zachowują dotychczasowe wyłączenie alarmowej kolorystyki. Licznik pokazuje czas od przekazania na kuchnię; nie zmienia stanu zamówienia.
- Preview może wymagać Vercel Preview Protection. Brak używania zalogowanych sesji lub obchodzenia ochrony; ręczny smoke wykonuje użytkownik.

## Ręczny smoke na UAT

1. Administrator: w Zamówieniach otwórz Narzędzia → Czas pracy / Pracownicy, wróć; sprawdź Konto i oba tryby.
2. Sushi master / su-chef: sprawdź tylko dozwolone narzędzia i akcje.
3. W obu trybach porównaj kolejność pilnych zamówień i każdy filtr. Brak ready_at powinien być na końcu.
4. Zamówienie przed przekazaniem nie ma licznika; po przekazaniu pojawia się „Czas przygotowania”. Przewidywany czas jest osobny.
5. Przejmij część komponentu zestawu, przełącz tryby, zakończ istniejącą akcję. Ilości i przypisania pozostają bez zmian.
6. Alert su-chefa: Zobacz zamówienie przewija/podświetla również po ustawieniu filtra; Przeczytane nie wraca po odświeżeniu.
7. Zagotówki: wybierz lokal, sprawdź selector i sesję w nagłówku; otwarcie i zamknięcie Czasu pracy nie zmienia wybranego lokalu ani planu.
8. Czas pracy: daty DD.MM.RRRR, filtry, KPI, długie sesje oznaczone Wymaga uwagi, korekta/audyt i XML. Nie zmieniaj rzeczywistych danych poza przygotowanymi kontami UAT.
9. Układ i klawiatura: 375/768/1440 px, poziomy scroll boardu/tabeli, Enter/Escape w menu.

PROD i main nietknięte. Nie wykonywać migracji ani deployów funkcji.

## Wyniki lokalne (2026-10-03)

- Node: 103/103 PASS, w tym PIN/Auth i logika istniejącej produkcji.
- Playwright, izolowany Chromium z syntetycznymi danymi: 80/80 PASS; 375/768/1440 px, menu, filtry, zegar, stan pending, zestawy, auth/PIN, pracownicy, Tasks i Worktime.
- Orders PostgreSQL: 189 PASS na bazowej ścieżce oraz 189 PASS po migracjach Tasks; dodatkowo kontrola zachowania schematu/ról.
- Worktime PostgreSQL: 58 PASS.
- Tasks PostgreSQL: 111 PASS.
- `test:migration`: PASS (dotychczasowy workflow produkcji, RLS, metadata, role/lokale i ponowne uruchomienie migracji w lokalnym PGlite).
- `lint`, `build:uat`, `git diff --check`: PASS. Build zgłasza ostrzeżenie o głównym chunku >500 kB.
- Wszystkie testy DB wyłącznie lokalne. Brak operacji na zdalnej bazie.
- UAT: oczekuje na push i potwierdzenie Preview dla tego commita. Smoke live UI wymaga ręcznego dostępu przez Preview Protection.
